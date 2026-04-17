import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { buildEstimateSentEmail } from "@/lib/emailTemplates";
import { requireMemberForApi } from "@/lib/auth/requireRole";
import { sendEmail } from "@/lib/notify";
import { buildEstimateLink, renderEstimateTemplate } from "@/lib/quote-template";
import { sendQuoteSchema } from "@/lib/quoteSendSchema";
import { SubscriptionRequiredError, requireActiveSubscription } from "@/lib/subscription";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { sendQuoteSms } from "@/lib/telnyx";
import { incrementUsageOnQuoteSend } from "@/lib/usage";

export const runtime = "nodejs";

function makePublicId(): string {
  // 96 bits of entropy. Public quote pages expose customer name, address,
  // and pricing — strong enough to be effectively unguessable.
  return randomBytes(12).toString("base64url");
}

function roundToNearestFive(value: number): number {
  return Math.round(value / 5) * 5;
}

// Derive idempotency keys for the downstream providers. Keyed on quote id
// so every retry for the same quote — whether a double-clicked Send button,
// a network-interrupted retry from the client, or the server's own CAS
// losing a race — presents the same key to Resend/Telnyx. Both providers
// reject the duplicate at their end so the customer only ever receives
// one email and one text per quote.
function resendIdempotencyKey(quoteId: string): string {
  return `quote-send-${quoteId}-email`;
}
function telnyxIdempotencyKey(quoteId: string): string {
  return `quote-send-${quoteId}-sms`;
}

export async function POST(request: Request) {
  const auth = await requireMemberForApi(request);
  if (!auth.ok) return auth.response;

  let quoteId: string | null = null;
  let bodyLeadId: string | null = null;
  // The send path accepts either a DRAFT (first send) or EXPIRED (resend
  // after 7-day window) as the starting status. On rollback we need to
  // know which of the two to revert to so the permanent public_id row
  // stays recoverable — "wasDraft" is the more descriptive name retained
  // from the prior revision; originalStatus holds the exact revert target.
  let wasDraft = false;
  let originalStatus: "DRAFT" | "EXPIRED" | null = null;

  try {
    const body = sendQuoteSchema.parse(await request.json());
    bodyLeadId = body.leadId;
    const admin = createAdminClient();
    const supabase = await createServerSupabaseClient();

    await requireActiveSubscription(auth.orgId);

    const { data: lead, error: leadError } = await admin
      .from("leads")
      .select("id,org_id,status,customer_name,customer_phone,customer_email,address_full,services")
      .eq("id", body.leadId)
      .eq("org_id", auth.orgId)
      .single();

    if (leadError || !lead) {
      return NextResponse.json({ error: "Lead not found." }, { status: 404 });
    }
    if (lead.status === "ACCEPTED") {
      return NextResponse.json({ error: "Lead already accepted." }, { status: 400 });
    }
    if (body.sendEmail && !lead.customer_email) {
      return NextResponse.json({ error: "Customer email is missing for email delivery." }, { status: 400 });
    }
    if (body.sendText && !lead.customer_phone) {
      return NextResponse.json({ error: "Customer phone is missing for text delivery." }, { status: 400 });
    }

    const { data: profile, error: profileError } = await admin
      .from("contractor_profile")
      .select("business_name,phone,email")
      .eq("org_id", auth.orgId)
      .single();
    if (profileError || !profile) {
      return NextResponse.json({ error: "Contractor profile not found." }, { status: 404 });
    }
    const {
      data: { user }
    } = await supabase.auth.getUser();

    // Check for an existing DRAFT quote (created at unlock time).
    // If one exists, UPDATE it to SENT. If not, fall back to INSERT for
    // backward compatibility with pre-existing unlocked leads.
    const { data: existingQuote } = await admin
      .from("quotes")
      .select("id,public_id,status,estimated_price_low,estimated_price_high,message,sent_via")
      .eq("lead_id", body.leadId)
      .eq("org_id", auth.orgId)
      .maybeSingle();

    // Defense-in-depth pre-check. A concurrent request may race past this
    // and still win the CAS below; the idempotency handling there returns
    // the first winner's result to the late caller. EXPIRED is allowed as
    // a "resend" entry point — the contractor has elected to re-send an
    // estimate that timed out without a customer response.
    const startingStatus = (existingQuote?.status as "DRAFT" | "EXPIRED" | null) ?? null;
    const canTransitionFromExisting =
      startingStatus === "DRAFT" || startingStatus === "EXPIRED";
    if (existingQuote && !canTransitionFromExisting) {
      return NextResponse.json({ error: "Estimate already sent for this lead." }, { status: 400 });
    }

    let confirmedPublicId: string;

    if (existingQuote && startingStatus) {
      // DRAFT or EXPIRED exists — update it to SENT via compare-and-swap.
      // The `.in("status", [startingStatus])` clause keeps the CAS narrow
      // to the exact status we observed so we only transition in a single
      // direction and a concurrent request can't win by flipping in a
      // different direction first.
      wasDraft = true;
      originalStatus = startingStatus;
      quoteId = existingQuote.id as string;
      confirmedPublicId = existingQuote.public_id as string;

      const { data: updatedRows, error: updateError } = await admin
        .from("quotes")
        .update({
          price: roundToNearestFive((body.estimatedPriceLow + body.estimatedPriceHigh) / 2),
          estimated_price_low: body.estimatedPriceLow,
          estimated_price_high: body.estimatedPriceHigh,
          message: body.message,
          status: "SENT",
          sent_at: new Date().toISOString(),
          // Clear sent_via — on an EXPIRED → SENT resend the prior
          // channel list from the first send doesn't apply to this one.
          sent_via: [],
          // Clear viewed_at / accepted_at so the resend starts a clean
          // lifecycle. ACCEPTED can't reach this branch (blocked above)
          // but zeroing these prevents any stale timestamps from polluting
          // the new window.
          viewed_at: null,
          accepted_at: null
        })
        .eq("id", quoteId)
        .eq("org_id", auth.orgId)
        .eq("status", startingStatus)
        .select("id");

      if (updateError) throw updateError;

      if (!updatedRows || updatedRows.length === 0) {
        // Another concurrent request beat us to the CAS transition.
        // Fetch the canonical row and return an idempotent success so the
        // late caller (usually a double-click) doesn't see a spurious
        // error. We intentionally do NOT re-send email/SMS — the winner
        // already did.
        const { data: winner } = await admin
          .from("quotes")
          .select("id,public_id,status,message,sent_via")
          .eq("id", quoteId)
          .eq("org_id", auth.orgId)
          .maybeSingle();

        if (winner && winner.status && winner.status !== "DRAFT" && winner.status !== "EXPIRED") {
          // Don't trigger the outer catch's rollback — nothing we did
          // needs reverting; clear the markers so the `catch` block
          // treats this as a clean exit.
          quoteId = null;
          wasDraft = false;
          originalStatus = null;
          return NextResponse.json({
            ok: true,
            quoteId: winner.id,
            publicId: winner.public_id,
            publicUrl: buildEstimateLink(winner.public_id as string),
            resolvedMessage: winner.message,
            usage: null,
            sentChannels: (winner.sent_via as ("email" | "text")[] | null) ?? [],
            warning: null,
            idempotent: true
          });
        }
        throw new Error("Estimate send failed: concurrent update lost.");
      }
    } else {
      // No draft — fall back to INSERT (backward compat for pre-existing unlocked leads)
      const requestedPublicId = body.publicId ?? makePublicId();
      const { data: quote, error: quoteError } = await admin
        .from("quotes")
        .insert({
          org_id: auth.orgId,
          lead_id: body.leadId,
          public_id: requestedPublicId,
          price: roundToNearestFive((body.estimatedPriceLow + body.estimatedPriceHigh) / 2),
          estimated_price_low: body.estimatedPriceLow,
          estimated_price_high: body.estimatedPriceHigh,
          message: body.message,
          status: "SENT",
          sent_at: new Date().toISOString()
        })
        .select("id,public_id")
        .single();

      if (quoteError || !quote) throw quoteError || new Error("Estimate send failed.");
      quoteId = quote.id as string;
      confirmedPublicId = quote.public_id as string;
    }

    // Resolve message template with the real permanent URL
    const estimateLink = buildEstimateLink(confirmedPublicId);
    const resolvedMessage = renderEstimateTemplate(body.message, {
      customerName: (lead.customer_name as string) || "Customer",
      estimateLink,
      companyName: (profile?.business_name as string) || "SnapQuote",
      contractorPhone: (profile?.phone as string) || "Not provided",
      contractorEmail: (profile?.email as string | null) || user?.email || "Not provided"
    });

    const { error: messageUpdateError } = await admin
      .from("quotes")
      .update({ message: resolvedMessage })
      .eq("id", quoteId)
      .eq("org_id", auth.orgId);

    if (messageUpdateError) throw messageUpdateError;

    const sentChannels: ("email" | "text")[] = [];
    const deliveryErrors: string[] = [];

    if (body.sendText) {
      try {
        await sendQuoteSms({
          to: lead.customer_phone as string,
          body: resolvedMessage,
          idempotencyKey: telnyxIdempotencyKey(quoteId)
        });
        sentChannels.push("text");
      } catch (error) {
        deliveryErrors.push(
          error instanceof Error ? error.message : "Failed to send estimate by text."
        );
      }
    }

    if (body.sendEmail) {
      const contractorReplyEmail =
        (profile?.email as string | null) ?? (user?.email as string | null) ?? null;
      const customerEmail = buildEstimateSentEmail({
        businessName: (profile?.business_name as string) || "SnapQuote",
        contractorPhone: (profile?.phone as string | null) ?? null,
        contractorEmail: contractorReplyEmail,
        estimateLow: body.estimatedPriceLow,
        estimateHigh: body.estimatedPriceHigh,
        publicId: confirmedPublicId
      });
      const emailSent = await sendEmail({
        to: lead.customer_email as string,
        subject: customerEmail.subject,
        text: customerEmail.text,
        html: customerEmail.html,
        // Replies go straight to the contractor, not to estimates@.
        replyTo: contractorReplyEmail,
        idempotencyKey: resendIdempotencyKey(quoteId)
      });
      if (!emailSent) {
        deliveryErrors.push("Failed to send estimate by email.");
      } else {
        sentChannels.push("email");
      }
    }

    if (sentChannels.length === 0) {
      throw new Error(deliveryErrors[0] || "Failed to send estimate.");
    }

    await admin
      .from("quotes")
      .update({ sent_via: sentChannels })
      .eq("id", quoteId)
      .eq("org_id", auth.orgId);

    await admin
      .from("leads")
      .update({ status: "QUOTED" })
      .eq("id", body.leadId)
      .eq("org_id", auth.orgId);

    await admin.from("quote_events").insert({
      org_id: auth.orgId,
      quote_id: quoteId,
      event_type: "SENT"
    });

    let usage: Awaited<ReturnType<typeof incrementUsageOnQuoteSend>> | null = null;

    try {
      usage = await incrementUsageOnQuoteSend(auth.orgId);
    } catch (usageError) {
      console.error("quote send usage increment failed:", usageError);
    }

    return NextResponse.json({
      ok: true,
      quoteId,
      publicId: confirmedPublicId,
      publicUrl: estimateLink,
      resolvedMessage,
      usage,
      sentChannels,
      warning: deliveryErrors.length > 0 ? deliveryErrors.join(" ") : null
    });
  } catch (error) {
    // Rollback: if this was a DRAFT→SENT transition, revert to DRAFT.
    // If it was a fresh INSERT, delete the quote entirely.
    if (quoteId && bodyLeadId) {
      const admin = createAdminClient();

      if (wasDraft) {
        // Revert back to the exact status we transitioned from — DRAFT for
        // a first send, EXPIRED for a resend. Never delete, or the
        // permanent public_id (and any customer link already shared) dies
        // with the row. sent_via clears either way; sent_at only resets
        // for a DRAFT (EXPIRED rows' sent_at is still meaningful as the
        // original delivery timestamp for audit purposes).
        const revertStatus = originalStatus ?? "DRAFT";
        const revertPatch: Record<string, unknown> = {
          status: revertStatus,
          sent_via: []
        };
        if (revertStatus === "DRAFT") {
          revertPatch.sent_at = null;
        }
        await admin
          .from("quotes")
          .update(revertPatch)
          .eq("id", quoteId)
          .eq("org_id", auth.orgId);
      } else {
        // Fresh insert — safe to delete
        await admin.from("quote_events").delete().eq("quote_id", quoteId);
        await admin.from("quotes").delete().eq("id", quoteId).eq("org_id", auth.orgId);
      }

      await admin
        .from("leads")
        .update({ status: "NEW" })
        .eq("id", bodyLeadId)
        .eq("org_id", auth.orgId)
        .eq("status", "QUOTED");
    }

    if (error instanceof SubscriptionRequiredError) {
      return NextResponse.json(
        {
          code: error.code,
          error: "Your subscription is inactive. Please update billing to continue."
        },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send estimate." },
      { status: 400 }
    );
  }
}
