import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerForApi } from "@/lib/auth/requireRole";
import { renderEmailShell, renderButton } from "@/lib/emailTemplates";
import { sendEmail } from "@/lib/notify";
import { rateLimit } from "@/lib/rateLimit";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomBytes, createHash } from "crypto";

const ONE_HOUR = 60 * 60 * 1000;
const TOKEN_TTL_HOURS = 24;

const bodySchema = z.object({
  email: z.string().email()
});

/**
 * POST /api/app/settings/verify-email
 *
 * Sends a verification email to the supplied address. The contractor
 * profile's email field is treated as "claimed" until the recipient
 * clicks the link, at which point we mark contractor_profile.email_verified.
 *
 * This intentionally does NOT update the email field itself — that's
 * persisted via the regular settings/update endpoint. The verification
 * token is keyed on (org_id, email_hash) so changing the address
 * invalidates any in-flight verification.
 */
export async function POST(request: Request) {
  const auth = await requireOwnerForApi(request);
  if (!auth.ok) return auth.response;

  if (!rateLimit(`verify-email:${auth.orgId}`, 5, ONE_HOUR)) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  try {
    const body = bodySchema.parse(await request.json());
    const targetEmail = body.email.trim().toLowerCase();
    const token = randomBytes(24).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * ONE_HOUR);

    const admin = createAdminClient();

    // Persist the pending verification on contractor_profile. We store
    // only the hash so a database leak doesn't grant verification.
    const { error: updateError } = await admin
      .from("contractor_profile")
      .update({
        email_verification_token_hash: tokenHash,
        email_verification_target: targetEmail,
        email_verification_expires_at: expiresAt.toISOString()
      })
      .eq("org_id", auth.orgId);

    if (updateError) {
      // Columns may not exist yet (migration pending). Surface a clear
      // error rather than failing silently.
      return NextResponse.json(
        {
          error:
            "Email verification storage is not ready yet. Please run the latest migrations."
        },
        { status: 500 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://snapquote.us";
    const verifyUrl = `${appUrl}/settings/verify-email?token=${encodeURIComponent(token)}&org=${encodeURIComponent(auth.orgId)}`;

    const html = renderEmailShell(
      "Verify your SnapQuote email",
      `
        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155;">
          You set this email as the contact address for your SnapQuote account.
          Click below to verify it within the next ${TOKEN_TTL_HOURS} hours.
        </p>
        ${renderButton("Verify Email", verifyUrl)}
        <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#64748b;">
          If you didn't request this, you can safely ignore this email.
        </p>
      `
    );

    const text = `Verify your SnapQuote email\n\nYou set this email as the contact address for your SnapQuote account. Visit the link below to verify it within the next ${TOKEN_TTL_HOURS} hours:\n\n${verifyUrl}\n\nIf you didn't request this, you can safely ignore this email.`;

    const sent = await sendEmail({
      to: targetEmail,
      subject: "Verify your SnapQuote email",
      text,
      html,
      sender: "noreply"
    });

    if (!sent) {
      return NextResponse.json(
        { error: "We couldn't send the verification email. Try again." },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Bad request." },
      { status: 400 }
    );
  }
}
