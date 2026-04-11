import { createAdminClient } from "@/lib/supabase/admin";
import { enforceServerOnly } from "@/lib/serverOnlyGuard";

enforceServerOnly();

type WebhookProvider = "stripe" | "revenuecat";

/**
 * Records a webhook delivery for idempotency. Returns true if this is the
 * first time the event has been seen and the caller should process it.
 * Returns false if the event was already recorded by a previous delivery.
 *
 * If processing fails after a successful claim, call releaseWebhookEvent so
 * the provider's retry can re-process it.
 */
export async function claimWebhookEvent(
  provider: WebhookProvider,
  eventId: string,
  eventType: string | null
): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("webhook_events")
    .upsert(
      { provider, event_id: eventId, event_type: eventType },
      { onConflict: "provider,event_id", ignoreDuplicates: true }
    )
    .select("event_id");

  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

export async function releaseWebhookEvent(
  provider: WebhookProvider,
  eventId: string
): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("webhook_events")
    .delete()
    .eq("provider", provider)
    .eq("event_id", eventId);
}
