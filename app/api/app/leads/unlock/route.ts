import { randomBytes } from "crypto";
import { after, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { recordAudit } from "@/lib/auditLog";
import { requireMemberForApi } from "@/lib/auth/requireRole";
import { getClientIp } from "@/lib/ip";
import { unlockLead } from "@/lib/credits";
import { DEFAULT_ESTIMATE_SMS_TEMPLATE } from "@/lib/quote-template";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOrgFilter } from "@/lib/supabase/orgFilter";

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

        // Fetch lead AI estimates for the draft. requireOrgFilter applies
        // .eq("org_id", auth.orgId) — Audit 8 M5 admin-client tenant filter
        // helper. Service-role bypasses RLS; the helper makes the tenant
        // gate explicit.
        const { data: lead } = await requireOrgFilter(
          admin
            .from("leads")
            .select(
              "ai_suggested_price,ai_estimate_low,ai_estimate_high"
            )
            .eq("id", body.leadId),
          auth.orgId
        ).single();

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
        //
        // Audit 13 H4 — but DO surface to Sentry as captureException, not
        // just console.error. Credit was charged; missing draft means the
        // contractor unlocked a lead with no DRAFT quote and has to recreate
        // it manually. Worth a Sentry event so we can investigate.
        Sentry.captureException(draftError, {
          tags: {
            area: "lead-unlock",
            stage: "draft-creation",
            org_id: auth.orgId
          },
          extra: { lead_id: body.leadId }
        });
        console.error("Failed to create DRAFT quote after unlock:", draftError);
        publicId = null;
      }
    } else {
      // Already unlocked — check if a draft quote exists and return its publicId
      try {
        const admin = createAdminClient();
        const { data: existingQuote } = await requireOrgFilter(
          admin
            .from("quotes")
            .select("public_id")
            .eq("lead_id", body.leadId),
          auth.orgId
        ).maybeSingle();

        publicId = (existingQuote?.public_id as string | null) ?? null;
      } catch {
        // Non-critical — continue without publicId
      }
    }

    // Best-effort audit. Runs after the response is sent so the user
    // never waits on the log write; recordAudit swallows internal errors
    // so an audit blip never surfaces as a failed unlock. We log both
    // the fresh-unlock and already-unlocked paths — an already-unlocked
    // request still represents a contractor (or team member) acting on
    // this lead and is worth the trail.
    const clientIp = getClientIp(request);
    const ipAddress = clientIp === "unknown" ? null : clientIp;
    const orgId = auth.orgId;
    const userId = auth.userId;
    const actorEmail = auth.userEmail;
    const leadIdForAudit = body.leadId;
    const { alreadyUnlocked, remainingCredits } = result;
    after(async () => {
      const admin = createAdminClient();
      await recordAudit(admin, {
        orgId,
        action: "lead.unlocked",
        actorUserId: userId,
        actorEmail,
        targetType: "lead",
        targetId: leadIdForAudit,
        metadata: {
          already_unlocked: alreadyUnlocked,
          remaining_credits: remainingCredits
        },
        ipAddress
      });
    });

    return NextResponse.json({
      ok: true,
      alreadyUnlocked: result.alreadyUnlocked,
      remainingCredits: result.remainingCredits,
      publicId
    });
  } catch (error) {
    // Audit 13 H4 — explicit captureException for top-level unlock
    // failures (credit charge, DB write, etc.). Tagged with org + user
    // so a tenant-wide unlock breakdown is searchable.
    Sentry.captureException(error, {
      tags: { area: "lead-unlock", org_id: auth.orgId, user_id: auth.userId }
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to unlock lead." },
      { status: 400 }
    );
  }
}
