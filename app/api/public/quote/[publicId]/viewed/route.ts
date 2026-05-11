import { NextResponse } from "next/server";
import { getClientIp } from "@/lib/ip";
import { sendPushToOrg } from "@/lib/pushNotifications";
import { rateLimit } from "@/lib/rateLimit";
import { createAdminClient } from "@/lib/supabase/admin";

type Props = {
  params: Promise<{ publicId: string }>;
};

// Audit 7 H1 — match the read cap. The handler fans out a push to every
// device in the org on the CAS-winner path; rate-limiting here keeps a
// bot tap from flooding contractor notifications.
const ONE_HOUR_MS = 60 * 60 * 1000;
const QUOTE_VIEWED_RATE_LIMIT = 60;

export async function POST(request: Request, { params }: Props) {
  const { publicId } = await params;

  const ip = getClientIp(request);
  if (!(await rateLimit(`public-quote-viewed:${ip}:${publicId}`, QUOTE_VIEWED_RATE_LIMIT, ONE_HOUR_MS))) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  const admin = createAdminClient();

  const { data: quote } = await admin
    .from("quotes")
    .select("id,org_id,lead_id,status,viewed_at")
    .eq("public_id", publicId)
    .single();

  if (!quote) return NextResponse.json({ error: "Estimate not found." }, { status: 404 });
  if (quote.status === "ACCEPTED" || quote.status === "EXPIRED") {
    return NextResponse.json({ viewed: true, status: quote.status });
  }

  // Fast-path short-circuit: if the quote is already viewed, we don't
  // even attempt the CAS. Saves a pointless write on every repeat view
  // (which is the overwhelmingly common case — customers tap the link
  // multiple times).
  if (quote.viewed_at) {
    return NextResponse.json({ viewed: true });
  }

  // Compare-and-swap: only flip viewed_at to now() if it's still null.
  // Two callers racing on the same quote (the customer double-tapping
  // their link, or opening it in two tabs) used to both clear the
  // `if (!quote.viewed_at)` gate above and both fire a push — the
  // contractor would see two "Estimate Opened" notifications. The CAS
  // gates on the row itself, so only one writer wins regardless of
  // how many concurrent POSTs arrive. The loser's UPDATE affects zero
  // rows and we silently skip the event + push.
  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await admin
    .from("quotes")
    .update({
      viewed_at: now,
      status: quote.status === "SENT" ? "VIEWED" : quote.status
    })
    .eq("id", quote.id)
    .is("viewed_at", null)
    .select("id");

  if (updateError) {
    console.warn("viewed CAS update failed:", updateError);
    return NextResponse.json({ viewed: true });
  }

  const wonCas = Array.isArray(updated) && updated.length > 0;
  if (!wonCas) {
    // Another concurrent request flipped viewed_at between our read and
    // our write. Their push + event fired; ours must not.
    return NextResponse.json({ viewed: true });
  }

  await admin.from("quote_events").insert({
    org_id: quote.org_id,
    quote_id: quote.id,
    event_type: "VIEWED"
  });

  // Fan out a push to every device in the org. Only fires for the CAS
  // winner — repeat views and concurrent races land in one of the
  // short-circuits above and skip this block entirely.
  void sendPushToOrg(quote.org_id as string, {
    title: "Estimate Opened",
    body: "A customer is viewing your estimate.",
    data: { screen: "lead", id: quote.lead_id as string }
  });
  // Audit 12 M2 — align the in-app row's screen+id to the push payload
  // (both target the lead detail screen). Previously this used screen
  // "quotes" + quote.id while the push used screen "lead" + lead_id, so
  // tapping the push and tapping the in-app entry landed in different
  // places.
  void admin
    .from("notifications")
    .insert({
      org_id: quote.org_id,
      type: "ESTIMATE_VIEWED",
      title: "Estimate Opened",
      body: "A customer is viewing your estimate.",
      screen: "lead",
      screen_params: { id: quote.lead_id as string }
    })
    .then(null, (err: unknown) => console.warn("notification insert failed:", err));

  return NextResponse.json({ viewed: true });
}
