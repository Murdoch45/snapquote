import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMemberForApi } from "@/lib/auth/requireRole";
import { unlockLead } from "@/lib/credits";
import { DEFAULT_ESTIMATE_SMS_TEMPLATE } from "@/lib/quote-template";
import { createAdminClient } from "@/lib/supabase/admin";

const unlockLeadSchema = z.object({
  leadId: z.string().uuid()
});

function makePublicId(): string {
  // 96 bits of entropy. Public quote pages expose customer name, address,
  // and pricing — strong enough to be effectively unguessable.
  return randomBytes(12).toString("base64url");
}

export async function POST(request: Request) {
  const auth = await requireMemberForApi(request);
  if (!auth.ok) return auth.response;

  try {
    const body = unlockLeadSchema.parse(await request.json());
    const result = await unlockLead(auth.orgId, body.leadId);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 402 });
    }

    // After a successful unlock (and not already-unlocked), create a DRAFT
    // quote with a permanent publicId and the lead's AI-generated prices.
    // This makes the estimate URL real and working from the moment of unlock.
    let publicId: string | null = null;

    if (!result.alreadyUnlocked) {
      try {
        const admin = createAdminClient();

        // Fetch lead AI estimates for the draft
        const { data: lead } = await admin
          .from("leads")
          .select(
            "ai_suggested_price,ai_estimate_low,ai_estimate_high"
          )
          .eq("id", body.leadId)
          .eq("org_id", auth.orgId)
          .single();

        const suggestedPrice = Number(lead?.ai_suggested_price ?? 0);
        const estimateLow = Number(lead?.ai_estimate_low ?? suggestedPrice);
        const estimateHigh = Number(lead?.ai_estimate_high ?? suggestedPrice);
        const price = Math.round(((estimateLow + estimateHigh) / 2) / 5) * 5 || suggestedPrice;

        publicId = makePublicId();

        await admin.from("quotes").insert({
          org_id: auth.orgId,
          lead_id: body.leadId,
          public_id: publicId,
          price: price || 0,
          estimated_price_low: estimateLow || null,
          estimated_price_high: estimateHigh || null,
          message: DEFAULT_ESTIMATE_SMS_TEMPLATE,
          status: "DRAFT",
          sent_at: null
        });
      } catch (draftError) {
        // Do not fail the unlock if the draft creation fails — the lead is
        // already unlocked and the credit has been charged. The lead detail
        // page will handle the missing draft gracefully.
        console.error("Failed to create DRAFT quote after unlock:", draftError);
        publicId = null;
      }
    } else {
      // Already unlocked — check if a draft quote exists and return its publicId
      try {
        const admin = createAdminClient();
        const { data: existingQuote } = await admin
          .from("quotes")
          .select("public_id")
          .eq("lead_id", body.leadId)
          .eq("org_id", auth.orgId)
          .maybeSingle();

        publicId = (existingQuote?.public_id as string | null) ?? null;
      } catch {
        // Non-critical — continue without publicId
      }
    }

    return NextResponse.json({
      ok: true,
      alreadyUnlocked: result.alreadyUnlocked,
      remainingCredits: result.remainingCredits,
      publicId
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to unlock lead." },
      { status: 400 }
    );
  }
}
