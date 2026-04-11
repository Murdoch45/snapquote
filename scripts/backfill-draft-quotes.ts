/**
 * One-time backfill script: creates DRAFT quote records for leads that are
 * already unlocked but don't have a quote yet. This ensures every unlocked
 * lead has a permanent estimate URL going forward.
 *
 * Run with: npx tsx scripts/backfill-draft-quotes.ts
 *
 * Safe to run multiple times — the lead_id unique constraint on quotes
 * prevents duplicate inserts.
 */

import { randomBytes } from "crypto";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function backfill() {
  // Find all unlocked leads that don't have a quote yet
  const { data: unlocks, error: unlocksError } = await admin
    .from("lead_unlocks")
    .select("org_id, lead_id");

  if (unlocksError) {
    console.error("Failed to fetch lead_unlocks:", unlocksError);
    process.exit(1);
  }

  if (!unlocks || unlocks.length === 0) {
    console.log("No unlocked leads found. Nothing to backfill.");
    return;
  }

  console.log(`Found ${unlocks.length} unlocked leads. Checking for missing quotes...`);

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const unlock of unlocks) {
    const orgId = unlock.org_id as string;
    const leadId = unlock.lead_id as string;

    // Check if a quote already exists for this lead
    const { data: existingQuote } = await admin
      .from("quotes")
      .select("id")
      .eq("lead_id", leadId)
      .maybeSingle();

    if (existingQuote) {
      skipped++;
      continue;
    }

    // Fetch lead AI estimates
    const { data: lead } = await admin
      .from("leads")
      .select("ai_suggested_price, ai_estimate_low, ai_estimate_high")
      .eq("id", leadId)
      .eq("org_id", orgId)
      .single();

    if (!lead) {
      console.warn(`Lead ${leadId} not found for org ${orgId}. Skipping.`);
      errors++;
      continue;
    }

    const suggestedPrice = Number(lead.ai_suggested_price ?? 0);
    const estimateLow = Number(lead.ai_estimate_low ?? suggestedPrice);
    const estimateHigh = Number(lead.ai_estimate_high ?? suggestedPrice);
    const price = Math.round(((estimateLow + estimateHigh) / 2) / 5) * 5 || suggestedPrice;
    const publicId = randomBytes(6).toString("base64url");

    const { error: insertError } = await admin.from("quotes").insert({
      org_id: orgId,
      lead_id: leadId,
      public_id: publicId,
      price: price || 0,
      estimated_price_low: estimateLow || null,
      estimated_price_high: estimateHigh || null,
      message: "",
      status: "DRAFT",
      sent_at: null
    });

    if (insertError) {
      // Unique constraint violation means quote was created between our check
      // and insert — that's fine, skip it.
      if (insertError.code === "23505") {
        skipped++;
      } else {
        console.error(`Failed to create draft for lead ${leadId}:`, insertError.message);
        errors++;
      }
      continue;
    }

    created++;
    console.log(`Created DRAFT quote for lead ${leadId} (publicId: ${publicId})`);
  }

  console.log(`\nBackfill complete: ${created} created, ${skipped} skipped, ${errors} errors.`);
}

backfill().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
