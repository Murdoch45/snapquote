import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/notify";
import { renderEmailShell, renderButton } from "@/lib/emailTemplates";
import { rateLimit } from "@/lib/rateLimit";

const ONE_HOUR = 60 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const { email } = (await request.json()) as { email?: string };

    if (typeof email === "string" && email.includes("@")) {
      const normalizedEmail = email.trim().toLowerCase();

      if (!rateLimit(`forgot:${normalizedEmail}`, 3, ONE_HOUR)) {
        // Silently return 200 — don't reveal rate limiting to avoid enumeration.
        return NextResponse.json({ ok: true });
      }
      const admin = createAdminClient();
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://snapquote.us";

      const { data, error } = await admin.auth.admin.generateLink({
        type: "recovery",
        email: email.trim().toLowerCase()
      });

      if (error) {
        console.warn("[forgot-password] generateLink failed:", {
          email: normalizedEmail,
          error: error.message
        });
      } else if (data?.properties?.hashed_token) {
        const tokenHash = data.properties.hashed_token;
        const resetUrl = `${appUrl}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=recovery&next=/reset-password`;

        const html = renderEmailShell(
          "Reset your password",
          `
            <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155;">
              We received a request to reset your SnapQuote password. Click the button below to choose a new one.
            </p>
            ${renderButton("Reset Password", resetUrl)}
            <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#64748b;">
              If you didn&rsquo;t request this, you can safely ignore this email. Your password will remain unchanged.
            </p>
          `
        );

        const text = `Reset your SnapQuote password\n\nWe received a request to reset your password. Visit the link below to choose a new one:\n\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.`;

        // sendEmail() already retries 3x internally with backoff. Capture and
        // log the result so silent send failures show up in our logs instead
        // of leaving the user wondering why they never got the email.
        const sent = await sendEmail({
          to: normalizedEmail,
          subject: "Reset your SnapQuote password",
          text,
          html,
          sender: "noreply"
        });

        if (!sent) {
          console.error(
            "[forgot-password] All retries exhausted, email NOT sent for",
            normalizedEmail
          );
        }
      }
    }
  } catch (err) {
    // Swallow all errors to avoid leaking info about whether the email exists.
    // Log internally so we can spot configuration issues.
    console.warn("[forgot-password] threw an error:", err);
  }

  // Always return 200 to prevent email enumeration.
  return NextResponse.json({ ok: true });
}
