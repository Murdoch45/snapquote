import { createPublicKey, verify } from "crypto";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

// Telnyx v2 webhook signing uses Ed25519. The public key is an org-level
// PEM-encoded value retrieved from Telnyx Mission Control (Account
// Settings → API → Public Key) or via GET https://api.telnyx.com/v2/public_key
// authenticated with the API key. Murdoch must populate this env var in
// Vercel production before signature verification can work in prod.
//
// Format expected: full PEM ("-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----")
// or the base64-encoded raw 32-byte Ed25519 public key — both are supported
// by buildPublicKey() below.
const SIGNATURE_HEADER = "telnyx-signature-ed25519";
const TIMESTAMP_HEADER = "telnyx-signature-ed25519-timestamp";

// 5-minute replay-protection window. Past this, even a valid signature
// is rejected — a captured webhook can't be replayed indefinitely.
const MAX_TIMESTAMP_SKEW_SECONDS = 5 * 60;

type TelnyxWebhookEnvelope = {
  data?: {
    record_type?: string;
    event_type?: string;
    id?: string;
    occurred_at?: string;
    payload?: {
      id?: string;
      to?: Array<{ phone_number?: string; status?: string; carrier?: string }>;
      from?: { phone_number?: string };
      errors?: Array<{ code?: string; title?: string; detail?: string }>;
      direction?: string;
    };
  };
};

function buildPublicKey(envValue: string): ReturnType<typeof createPublicKey> {
  const trimmed = envValue.trim();
  if (trimmed.startsWith("-----BEGIN")) {
    return createPublicKey({ key: trimmed, format: "pem" });
  }
  // Telnyx also documents the public key as a bare base64 32-byte value.
  // Wrap it in a SubjectPublicKeyInfo DER prefix for Ed25519:
  // SEQUENCE { SEQUENCE { OID 1.3.101.112 }, BIT STRING }
  // The first 12 bytes are the fixed Ed25519 SPKI prefix.
  const ED25519_SPKI_PREFIX = Buffer.from([
    0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00
  ]);
  const rawKey = Buffer.from(trimmed, "base64");
  if (rawKey.length !== 32) {
    throw new Error(
      `Telnyx public key must be a 32-byte Ed25519 key (got ${rawKey.length} bytes after base64-decoding TELNYX_PUBLIC_KEY).`
    );
  }
  const spki = Buffer.concat([ED25519_SPKI_PREFIX, rawKey]);
  return createPublicKey({ key: spki, format: "der", type: "spki" });
}

function verifySignature(
  rawBody: string,
  timestamp: string,
  signature: string,
  publicKeyPem: string
): boolean {
  try {
    const key = buildPublicKey(publicKeyPem);
    const signed = `${timestamp}|${rawBody}`;
    const sigBuf = Buffer.from(signature, "base64");
    return verify(null, Buffer.from(signed, "utf8"), key, sigBuf);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { area: "telnyx-webhook", stage: "signature-verify" }
    });
    return false;
  }
}

function timestampIsFresh(timestampHeader: string): boolean {
  const tsSeconds = Number(timestampHeader);
  if (!Number.isFinite(tsSeconds)) return false;
  const nowSeconds = Math.floor(Date.now() / 1000);
  return Math.abs(nowSeconds - tsSeconds) <= MAX_TIMESTAMP_SKEW_SECONDS;
}

// Maps Telnyx event types to our internal sms_delivery_status column.
// "message.sent" and "message.finalized" are intermediate — we record
// "sent" so the column isn't NULL while we wait for the delivered/failed
// terminal event. Unknown event types are ignored (return null, handler
// 200-OKs without DB write).
function mapEventTypeToStatus(eventType: string): "queued" | "sent" | "delivered" | "failed" | null {
  switch (eventType) {
    case "message.sent":
    case "message.finalized":
      return "sent";
    case "message.delivered":
      return "delivered";
    case "message.delivery_failed":
      return "failed";
    case "message.received":
      // Inbound SMS (customer replied to a quote). Not a DLR for the
      // outbound message, so don't write to the quote row. A future
      // inbox feature would handle these; for now they're 200-OK no-op.
      return null;
    default:
      return null;
  }
}

export async function POST(request: Request) {
  const signature = request.headers.get(SIGNATURE_HEADER);
  const timestamp = request.headers.get(TIMESTAMP_HEADER);
  const publicKey = process.env.TELNYX_PUBLIC_KEY;

  if (!publicKey) {
    // Fail closed. Without the key configured we cannot verify signatures
    // and must not trust any webhook payload as authoritative. Captured
    // so this surfaces in Sentry the moment Murdoch enables the webhook
    // in Telnyx but forgets the env var.
    Sentry.captureMessage("Telnyx webhook received but TELNYX_PUBLIC_KEY is not configured.", {
      level: "error",
      tags: { area: "telnyx-webhook", stage: "config" }
    });
    return NextResponse.json({ error: "Webhook not configured." }, { status: 500 });
  }

  if (!signature || !timestamp) {
    return NextResponse.json({ error: "Missing signature headers." }, { status: 401 });
  }

  if (!timestampIsFresh(timestamp)) {
    Sentry.captureMessage("Telnyx webhook rejected: timestamp outside replay window.", {
      level: "warning",
      tags: { area: "telnyx-webhook", stage: "replay-protection" }
    });
    return NextResponse.json({ error: "Stale timestamp." }, { status: 401 });
  }

  const rawBody = await request.text();
  if (!verifySignature(rawBody, timestamp, signature, publicKey)) {
    Sentry.captureMessage("Telnyx webhook rejected: signature invalid.", {
      level: "warning",
      tags: { area: "telnyx-webhook", stage: "signature-verify" }
    });
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let envelope: TelnyxWebhookEnvelope;
  try {
    envelope = JSON.parse(rawBody) as TelnyxWebhookEnvelope;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const eventType = envelope.data?.event_type;
  const messageId = envelope.data?.payload?.id;
  const direction = envelope.data?.payload?.direction;

  Sentry.addBreadcrumb({
    category: "telnyx.webhook",
    level: "info",
    message: "signature verified",
    data: {
      event_type: eventType,
      message_id: messageId,
      direction
    }
  });

  if (!eventType) {
    return NextResponse.json({ received: true });
  }

  const status = mapEventTypeToStatus(eventType);
  if (!status || !messageId) {
    // Unknown event type, inbound message, or no message id — 200-OK
    // so Telnyx doesn't retry. The breadcrumb above records what we
    // ignored so a sudden flood of unknowns is debuggable.
    return NextResponse.json({ received: true });
  }

  const failureReason =
    status === "failed"
      ? envelope.data?.payload?.errors?.[0]?.title ?? "Unknown carrier failure"
      : null;

  try {
    const admin = createAdminClient();

    // Look up the quote by telnyx_message_id. RLS-bypass admin client so
    // we can write to any org's row (the publicId in the URL or the
    // bearer-auth on quote-send doesn't apply here — this is a server-
    // to-server callback).
    const { data: quote, error: lookupError } = await admin
      .from("quotes")
      .select("id, org_id, lead_id, sms_delivery_status")
      .eq("telnyx_message_id", messageId)
      .maybeSingle();

    if (lookupError) {
      throw lookupError;
    }

    if (!quote) {
      // No matching quote. Could be a non-quote SMS (unlikely — we don't
      // send any other Telnyx SMS today), a stale message id (DB rolled
      // back after send), or a manual test from Mission Control. 200-OK.
      return NextResponse.json({ received: true, matched: false });
    }

    // Don't downgrade a terminal status. If the row already says
    // "delivered" or "failed", a follow-up "sent" event shouldn't
    // overwrite it — Telnyx occasionally reorders events.
    const currentStatus = quote.sms_delivery_status as string | null;
    const terminalStatuses = new Set(["delivered", "failed"]);
    if (currentStatus && terminalStatuses.has(currentStatus)) {
      return NextResponse.json({ received: true, ignored: "already-terminal" });
    }

    const updatePayload: Record<string, unknown> = {
      sms_delivery_status: status
    };
    if (status === "delivered") {
      updatePayload.sms_delivered_at = new Date().toISOString();
    }
    if (status === "failed") {
      updatePayload.sms_failure_reason = failureReason;
    }

    const { error: updateError } = await admin
      .from("quotes")
      .update(updatePayload)
      .eq("id", quote.id);

    if (updateError) {
      throw updateError;
    }

    // Surface a failed delivery to the contractor's in-app feed so they
    // know to reach out via another channel. No PII — the audit doc H3
    // pattern keeps customer name out of notification payloads.
    if (status === "failed") {
      const { error: insertError } = await admin.from("notifications").insert({
        org_id: quote.org_id,
        type: "QUOTE_DELIVERY_FAILED",
        title: "SMS delivery failed",
        body: failureReason
          ? `An estimate SMS didn't reach the customer (${failureReason}). Tap to follow up directly.`
          : "An estimate SMS didn't reach the customer. Tap to follow up directly.",
        screen: "lead",
        screen_params: { id: quote.lead_id as string }
      });
      if (insertError) {
        // Don't fail the webhook on insert failure — the carrier-level
        // status has already been persisted, which is the load-bearing
        // change. The notification is a nice-to-have on top.
        Sentry.captureException(insertError, {
          tags: {
            area: "telnyx-webhook",
            stage: "delivery-failed-notification-insert",
            org_id: quote.org_id as string
          }
        });
      }
    }

    return NextResponse.json({ received: true, matched: true, status });
  } catch (error) {
    Sentry.captureException(error, {
      tags: {
        area: "telnyx-webhook",
        stage: "handler",
        event_type: eventType
      },
      extra: { message_id: messageId }
    });
    // Return 200 anyway — Telnyx will retry on 5xx and we've already
    // captured the error to Sentry. A persistent failure is a Sentry
    // issue, not a Telnyx-retry-loop issue.
    return NextResponse.json({ received: true, error: "handler failed" });
  }
}
