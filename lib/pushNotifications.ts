import * as Sentry from "@sentry/nextjs";

import { createAdminClient } from "@/lib/supabase/admin";

type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

// Audit 12 L4 — switched from legacy exp.host to api.expo.dev, Expo's
// canonical push host. Both still work today; the new host is what
// Expo's current docs point at.
const EXPO_PUSH_URL = "https://api.expo.dev/v2/push/send";

// Errors that mean the token is permanently invalid and should be removed.
// MessageRateExceeded and MessageTooBig are not terminal — don't delete on those.
const TERMINAL_PUSH_ERRORS = new Set([
  "DeviceNotRegistered",
  "InvalidCredentials",
  "MismatchSenderId"
]);

type ExpoTicket = {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
};

type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  data: Record<string, string>;
  sound: "default";
  priority: "high";
  /**
   * iOS app icon badge. Audit 12 M1 — without this field the badge never
   * updates from whatever the OS last set, even when unread notifications
   * exist. We compute it once per send (cheap COUNT on notifications) and
   * include it so every push keeps the badge synced with reality.
   */
  badge: number;
};

/**
 * Sends a push notification to every registered device for an org. Removes
 * tokens that come back with a terminal error so dead devices stop wasting
 * Expo quota and stop masking real notification problems.
 */
export async function sendPushToOrg(
  orgId: string,
  payload: PushPayload
): Promise<{ sent: number; cleanedUp: number }> {
  const admin = createAdminClient();

  // Audit 12 H4 — breadcrumb on every dispatch attempt so a failure
  // downstream has the org context for Sentry triage. Title is included
  // (no PII per H3 — push titles are generic event labels) but the body
  // is not, in case any future caller does smuggle PII in.
  Sentry.addBreadcrumb({
    category: "push.dispatch",
    level: "info",
    message: "sendPushToOrg start",
    data: { org_id: orgId, title: payload.title, screen: payload.data?.screen ?? null }
  });

  const { data: rows, error } = await admin
    .from("push_tokens")
    .select("expo_push_token")
    .eq("org_id", orgId);

  if (error) {
    // Audit 12 H4 — was a silent return on error. Now captured with
    // org tag so this surfaces in Sentry as an actionable event instead
    // of swallowing the failure entirely.
    Sentry.captureException(error, {
      tags: { area: "push", stage: "token-fetch", org_id: orgId }
    });
    return { sent: 0, cleanedUp: 0 };
  }

  if (!rows || rows.length === 0) {
    return { sent: 0, cleanedUp: 0 };
  }

  const tokens = rows
    .map((row) => (row.expo_push_token as string | null) ?? "")
    .filter(Boolean);

  if (tokens.length === 0) return { sent: 0, cleanedUp: 0 };

  // Audit 12 M1 — compute the org's unread count once for this dispatch
  // and include it as the iOS badge. Cheap (indexed via
  // notifications_org_unread_idx — partial index on read=false). One read
  // per dispatch, regardless of token count.
  const badge = await getUnreadBadgeCount(admin, orgId);

  const tickets = await sendBatch(tokens, payload, badge, orgId);
  const deadTokens: string[] = [];
  let sent = 0;

  tickets.forEach((ticket, index) => {
    if (ticket.status === "ok") {
      sent += 1;
    } else if (ticket.details?.error && TERMINAL_PUSH_ERRORS.has(ticket.details.error)) {
      const deadToken = tokens[index];
      if (deadToken) deadTokens.push(deadToken);
    }
  });

  if (deadTokens.length > 0) {
    const { error: deleteError } = await admin
      .from("push_tokens")
      .delete()
      .in("expo_push_token", deadTokens);
    if (deleteError) {
      Sentry.captureException(deleteError, {
        tags: { area: "push", stage: "dead-token-cleanup", org_id: orgId },
        extra: { dead_count: deadTokens.length }
      });
    }
  }

  Sentry.addBreadcrumb({
    category: "push.dispatch",
    level: "info",
    message: "sendPushToOrg done",
    data: { org_id: orgId, sent, cleaned_up: deadTokens.length, attempted: tokens.length }
  });

  return { sent, cleanedUp: deadTokens.length };
}

/**
 * Reads the unread-notification count for an org. Returns 0 on read
 * failure so the badge field still ships (a `badge: 0` payload clears
 * the dot — safer fallback than omitting the field, which would leave
 * the badge at its previous value).
 */
async function getUnreadBadgeCount(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string
): Promise<number> {
  try {
    const { count, error } = await admin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("read", false);
    if (error) {
      Sentry.captureException(error, {
        tags: { area: "push", stage: "badge-count", org_id: orgId }
      });
      return 0;
    }
    return count ?? 0;
  } catch (error) {
    Sentry.captureException(error, {
      tags: { area: "push", stage: "badge-count", org_id: orgId }
    });
    return 0;
  }
}

async function sendBatch(
  tokens: string[],
  payload: PushPayload,
  badge: number,
  orgId: string
): Promise<ExpoTicket[]> {
  try {
    const messages: ExpoMessage[] = tokens.map((token) => ({
      to: token,
      title: payload.title,
      body: payload.body,
      data: payload.data ?? {},
      sound: "default",
      priority: "high",
      badge
    }));

    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(messages)
    });

    if (!response.ok) {
      // Audit 12 H4 — was console.error only. Now captured with tags so
      // an Expo outage surfaces as an actionable Sentry event rather
      // than a tag-less console-forwarded warning.
      const responseText = await response.text().catch(() => "");
      Sentry.captureMessage(
        `Expo push HTTP error ${response.status} ${response.statusText}`,
        {
          level: "error",
          tags: { area: "push", stage: "expo-http", org_id: orgId },
          extra: { status: response.status, body_excerpt: responseText.slice(0, 500) }
        }
      );
      return tokens.map(() => ({ status: "error" as const }));
    }

    const json = (await response.json()) as { data?: ExpoTicket[] };
    return json.data ?? tokens.map(() => ({ status: "error" as const }));
  } catch (error) {
    // Network / DNS / TLS failure. Captured so an outage on Expo's side
    // is visible in Sentry instead of just stderr.
    Sentry.captureException(error, {
      tags: { area: "push", stage: "expo-fetch", org_id: orgId }
    });
    return tokens.map(() => ({ status: "error" as const }));
  }
}
