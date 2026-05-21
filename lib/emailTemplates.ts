import { buildQuoteLink, getCustomerFirstName } from "@/lib/quote-template";
import { formatCurrencyRange, toCurrency } from "@/lib/utils";

/**
 * 2026-05-20 — single shared email template applied to ALL transactional
 * emails. Replaces the previous slate/DM-Sans shell with the brand-aligned
 * 600px Helvetica Neue / electric-blue template (SnapQuote_Email_Template.html).
 *
 * Contract preserved:
 *   - renderEmailShell(title, bodyHtml, opts?) — title becomes the H1
 *     headline; bodyHtml is the swappable body content (paragraphs, field
 *     cards, an optional CTA button rendered inline via renderButton).
 *   - renderButton(label, href) — MSO-safe roundrect button styled as the
 *     template's electric-blue CTA. Caller decides where to place it
 *     inside the body.
 *   - renderField(label, value) — light card to display a labelled value.
 *
 * Optional audience flag (default "contractor") only varies the footer
 * legal text — customer-facing emails get the "you requested an estimate"
 * line, contractor-facing emails get the "transactional email" line.
 */

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const FOOTER_LEGAL_CUSTOMER =
  "You’re receiving this email because you requested an estimate through SnapQuote. If this wasn’t you, you can safely ignore this message. © 2026 SnapQuote, Inc. All rights reserved.";

const FOOTER_LEGAL_CONTRACTOR =
  "This is a transactional email related to your SnapQuote account. © 2026 SnapQuote, Inc. All rights reserved.";

type RenderEmailShellOpts = {
  /**
   * "contractor" (default) renders the dashboard-account footer line;
   * "customer" renders the estimate-request footer line.
   */
  audience?: "contractor" | "customer";
  /**
   * Inbox preview text shown next to the subject in most clients. Kept
   * short — leave undefined to render an invisible non-breaking space.
   */
  preheader?: string;
};

export function renderEmailShell(
  title: string,
  bodyHtml: string,
  opts: RenderEmailShellOpts = {}
): string {
  const audience = opts.audience ?? "contractor";
  const footerLegal =
    audience === "customer" ? FOOTER_LEGAL_CUSTOMER : FOOTER_LEGAL_CONTRACTOR;
  const preheader = opts.preheader ?? "";
  return `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en"><head>
  <meta charset="utf-8">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>SnapQuote</title>

  <!--[if mso]>
  <style type="text/css">
    table, td, div, p, a { font-family: Arial, Helvetica, sans-serif !important; }
  </style>
  <![endif]-->

  <style type="text/css">
    body, table, td, p, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-collapse: collapse; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; display: block; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: #ffffff; }
    a { color: #2563EB; text-decoration: none; }

    @media only screen and (max-width: 620px) {
      .sq-container { width: 100% !important; max-width: 100% !important; }
      .sq-px { padding-left: 24px !important; padding-right: 24px !important; }
      .sq-h1 { font-size: 26px !important; line-height: 32px !important; }
      .sq-btn a { display: block !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; width:100%; background-color:#ffffff;">

  <!-- Preheader (hidden preview text shown in inbox list) -->
  <div style="display:none; visibility:hidden; opacity:0; color:transparent; height:0; width:0; overflow:hidden; mso-hide:all;">
    ${preheader ? esc(preheader) : "&nbsp;"}
  </div>

  <!-- Outer wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background-color:#ffffff;">
    <tbody><tr>
      <td align="center" style="padding:0;">

        <!-- 600px container -->
        <table role="presentation" class="sq-container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:600px;">

          <!-- HEADER (logo lockup) -->
          <tbody><tr>
            <td class="sq-px" align="left" bgcolor="#ffffff" style="background-color:#ffffff; padding:36px 40px 28px 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tbody><tr>
                  <td valign="middle" style="padding-right:12px; line-height:0;">
                    <img src="https://snapquote.us/email/snapquote-logo.png" width="44" height="39" alt="SnapQuote" style="display:block; width:44px; height:39px; border:0; outline:none; text-decoration:none;">
                  </td>
                  <td valign="middle" style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; font-size:24px; line-height:32px; font-weight:800; color:#2563EB; letter-spacing:-0.6px; mso-line-height-rule:exactly;">
                    SnapQuote
                  </td>
                </tr>
              </tbody></table>
            </td>
          </tr>

          <!-- Thin divider under header -->
          <tr>
            <td class="sq-px" bgcolor="#ffffff" style="background-color:#ffffff; padding:0 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tbody><tr><td height="1" style="height:1px; line-height:1px; font-size:1px; background-color:#E5E7EB;">&nbsp;</td></tr>
              </tbody></table>
            </td>
          </tr>

          <!-- BODY — swappable per email -->
          <tr>
            <td class="sq-px" align="left" bgcolor="#ffffff" style="background-color:#ffffff; padding:48px 40px 56px 40px;">
              <h1 class="sq-h1" style="margin:0 0 20px 0; font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; font-size:30px; line-height:38px; font-weight:700; color:#0B0E14; letter-spacing:-0.5px;">
                ${esc(title)}
              </h1>
              ${bodyHtml}
            </td>
          </tr>

          <!-- Divider above footer -->
          <tr>
            <td class="sq-px" bgcolor="#ffffff" style="background-color:#ffffff; padding:0 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tbody><tr><td height="1" style="height:1px; line-height:1px; font-size:1px; background-color:#E5E7EB;">&nbsp;</td></tr>
              </tbody></table>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td class="sq-px" align="left" bgcolor="#ffffff" style="background-color:#ffffff; padding:24px 40px 40px 40px;">
              <p style="margin:0 0 8px 0; font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; font-size:12px; line-height:18px; color:#6B7280;">
                SnapQuote &middot; <a href="https://snapquote.us" style="color:#6B7280; text-decoration:underline;">snapquote.us</a> &middot; <a href="mailto:support@snapquote.us" style="color:#6B7280; text-decoration:underline;">support@snapquote.us</a>
              </p>
              <p style="margin:0; font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; font-size:12px; line-height:18px; color:#9CA3AF;">
                ${footerLegal}
              </p>
            </td>
          </tr>

        </tbody></table>

      </td>
    </tr>
  </tbody></table>

</body></html>`;
}

/**
 * MSO-safe CTA button. Renders a VML roundrect for Outlook desktop and an
 * inline-block anchor for everyone else. Inserted inline inside the body
 * slot at the caller's chosen point. Default top margin of 8px so the
 * button sits in its own block when placed after a paragraph.
 */
export function renderButton(label: string, href: string) {
  const safeHref = esc(href);
  const safeLabel = esc(label);
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="sq-btn" style="margin:8px 0 16px 0;">
      <tbody><tr>
        <td align="center" bgcolor="#2563EB" style="background-color:#2563EB; border-radius:10px; mso-padding-alt:14px 28px;">
          <!--[if mso]>
          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeHref}" style="height:48px; v-text-anchor:middle; width:240px;" arcsize="20%" stroke="f" fillcolor="#2563EB">
            <w:anchorlock/>
            <center style="color:#ffffff; font-family:Arial,sans-serif; font-size:16px; font-weight:700;">${safeLabel}</center>
          </v:roundrect>
          <![endif]-->
          <!--[if !mso]><!-- -->
          <a href="${safeHref}" target="_blank" style="display:inline-block; padding:14px 28px; font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; font-size:16px; line-height:20px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:10px; background-color:#2563EB; mso-hide:all;">
            ${safeLabel}
          </a>
          <!--<![endif]-->
        </td>
      </tr>
    </tbody></table>
  `;
}

/**
 * Light card for labelled values (estimate range, phone, email, etc.).
 * Visual palette matches the new template — Helvetica Neue body text,
 * #E5E7EB border, light-gray card background.
 */
export function renderField(label: string, value: string) {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px 0;">
      <tbody><tr>
        <td style="padding:14px 16px; background-color:#F8FAFC; border:1px solid #E5E7EB; border-radius:12px;">
          <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; font-size:12px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:#6B7280;">
            ${esc(label)}
          </div>
          <div style="margin-top:6px; font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; font-size:15px; line-height:22px; color:#1F2937;">
            ${esc(value)}
          </div>
        </td>
      </tr>
    </tbody></table>
  `;
}

/**
 * Standard body paragraph rendered to the new template's typographic
 * spec. Use this in every email so paragraph spacing/font/colour stays
 * consistent. Pass the html fragment as-is — string contents are
 * trusted (caller decides what to escape).
 */
export function renderParagraph(html: string, opts: { bottom?: number } = {}): string {
  const bottom = opts.bottom ?? 20;
  return `<p style="margin:0 0 ${bottom}px 0; font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; font-size:16px; line-height:26px; color:#1F2937;">
    ${html}
  </p>`;
}

/**
 * Sign-off line. Renders the standard "— The SnapQuote team" with the
 * same paragraph styling as renderParagraph, but no bottom margin (it's
 * the last line of the body slot).
 */
export function renderSignOff(line = "— The SnapQuote team"): string {
  return `<p style="margin:0; font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; font-size:16px; line-height:26px; color:#1F2937;">
    ${esc(line)}
  </p>`;
}

// ---------------------------------------------------------------------------
// Email builders
// ---------------------------------------------------------------------------

export function buildEstimateSentEmail(input: {
  businessName: string;
  contractorPhone: string | null;
  contractorEmail: string | null;
  estimateLow: number;
  estimateHigh: number;
  publicId: string;
}) {
  const quoteUrl = buildQuoteLink(input.publicId);
  const title = `You have a new starting estimate from ${input.businessName}`;
  const priceRange =
    formatCurrencyRange(input.estimateLow, input.estimateHigh) ??
    `${toCurrency(input.estimateLow)} - ${toCurrency(input.estimateHigh)}`;

  return {
    subject: title,
    text: `${title}\n\nThe final price may change once we see the property in person.\n\nEstimated price: ${priceRange}\nPhone: ${input.contractorPhone ?? "Not provided"}\nEmail: ${input.contractorEmail ?? "Not provided"}\n\nView estimate: ${quoteUrl}`,
    html: renderEmailShell(
      title,
      `
        ${renderParagraph(
          "Your starting estimate is ready. The final price may change once we see the property in person. Review the price range below and reach out to your contractor if you have any questions."
        )}
        ${renderField("Estimate range", priceRange)}
        ${renderField("Contractor", input.businessName)}
        ${renderField("Phone", input.contractorPhone ?? "Not provided")}
        ${renderField("Email", input.contractorEmail ?? "Not provided")}
        ${renderButton("View Estimate", quoteUrl)}
      `,
      { audience: "customer", preheader: `Estimate range: ${priceRange}` }
    )
  };
}

export function buildCustomerConfirmationEmail(input: {
  businessName: string;
  businessPhone: string | null;
  businessEmail: string | null;
}) {
  const title = `${input.businessName} received your estimate request`;

  return {
    subject: title,
    text: `${title}\n\nThanks for reaching out! We received your request and will be in touch shortly with your estimate.\nPhone: ${input.businessPhone ?? "Not provided"}\nEmail: ${input.businessEmail ?? "Not provided"}`,
    html: renderEmailShell(
      title,
      `
        ${renderParagraph(
          "Thanks for reaching out! We received your request and will be in touch shortly with your estimate."
        )}
        ${renderField("Phone", input.businessPhone ?? "Not provided")}
        ${renderField("Email", input.businessEmail ?? "Not provided")}
        ${renderParagraph(
          "If you don’t see this email in your inbox, please check your spam or junk folder.",
          { bottom: 0 }
        )}
      `,
      { audience: "customer", preheader: `${input.businessName} will be in touch shortly.` }
    )
  };
}

export function buildNewLeadNotificationEmail(input: {
  customerName: string;
  serviceType: string;
  cityState: string;
  estimateLow: number | null;
  estimateHigh: number | null;
  leadUrl: string;
}) {
  const firstName = getCustomerFirstName(input.customerName);
  const title = `New lead request from ${firstName}`;
  const estimateRange =
    formatCurrencyRange(input.estimateLow, input.estimateHigh) ?? "AI estimate ready in SnapQuote";

  return {
    subject: title,
    text: `${title}\n\nService: ${input.serviceType}\nLocation: ${input.cityState}\nAI estimate: ${estimateRange}\n\nView lead: ${input.leadUrl}`,
    html: renderEmailShell(
      title,
      `
        ${renderParagraph("A new job request just came in and is ready for review.")}
        ${renderField("Service", input.serviceType)}
        ${renderField("Location", input.cityState)}
        ${renderField("AI estimate", estimateRange)}
        ${renderButton("View Lead", input.leadUrl)}
      `,
      { preheader: `New ${input.serviceType} lead in ${input.cityState}.` }
    )
  };
}

export function buildWelcomeEmail() {
  const title = "Welcome to SnapQuote";
  const requestLinkUrl = "https://snapquote.us/app/my-link";
  const dashboardUrl = "https://snapquote.us/app";

  return {
    subject: title,
    text: `${title}

Hey there, welcome to SnapQuote — you're all set to start receiving job requests and sending AI-powered estimates.

Here's how to get rolling:
  1. Share your request link so customers can submit jobs to you.
  2. Unlock leads you're interested in.
  3. Send estimates in seconds with AI.

Open your dashboard: ${dashboardUrl}
Get your request link: ${requestLinkUrl}

Let's get to work.
— The SnapQuote team`,
    html: renderEmailShell(
      title,
      `
        ${renderParagraph(
          "Hey there, welcome to SnapQuote — you’re all set to start receiving job requests and sending AI-powered estimates."
        )}
        ${renderParagraph("Here’s how to get rolling:")}
        <ul style="margin:0 0 20px 0; padding-left:20px; font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; font-size:16px; line-height:26px; color:#1F2937;">
          <li>Share your request link so customers can submit jobs to you.</li>
          <li>Unlock leads you’re interested in.</li>
          <li>Send estimates in seconds with AI.</li>
        </ul>
        ${renderButton("Open Dashboard", dashboardUrl)}
        ${renderParagraph("Let’s get to work.", { bottom: 4 })}
        ${renderSignOff()}
      `,
      { preheader: "You’re set up — here’s how to start receiving job requests." }
    )
  };
}

export function buildPlanUpgradedEmail(input: {
  planLabel: string;
  monthlyCredits: number;
  seatLimit: number;
}) {
  const title = `You’re on the ${input.planLabel} plan`;

  return {
    subject: title,
    text: `${title}

Hey there, your plan has been upgraded to ${input.planLabel}. You now have ${input.monthlyCredits} credits per month and ${input.seatLimit} team ${
      input.seatLimit === 1 ? "seat" : "seats"
    }.

Thanks for growing with us.
— The SnapQuote team`,
    html: renderEmailShell(
      title,
      `
        ${renderParagraph(
          `Hey there, your plan has been upgraded to <strong>${esc(input.planLabel)}</strong>. You now have <strong>${input.monthlyCredits} credits per month</strong> and <strong>${input.seatLimit} team ${input.seatLimit === 1 ? "seat" : "seats"}</strong>.`
        )}
        ${renderButton("Open Dashboard", "https://snapquote.us/app")}
        ${renderParagraph("Thanks for growing with us.", { bottom: 4 })}
        ${renderSignOff()}
      `,
      { preheader: `Welcome to the ${input.planLabel} plan.` }
    )
  };
}

export function buildPlanEndedEmail(input: { previousPlanLabel: string }) {
  const title = "Your SnapQuote plan has changed";
  const planUrl = "https://snapquote.us/app/plan";

  return {
    subject: title,
    text: `${title}

Hey there, your ${input.previousPlanLabel} subscription has ended and your account has been moved to the Solo plan. You'll still have access to SnapQuote with 5 credits per month.

If this was a mistake or you'd like to reactivate, you can upgrade anytime: ${planUrl}

— The SnapQuote team`,
    html: renderEmailShell(
      title,
      `
        ${renderParagraph(
          `Hey there, your <strong>${esc(input.previousPlanLabel)}</strong> subscription has ended and your account has been moved to the <strong>Solo</strong> plan. You’ll still have access to SnapQuote with 5 credits per month.`
        )}
        ${renderParagraph(
          "If this was a mistake or you’d like to reactivate, you can upgrade anytime."
        )}
        ${renderButton("Reactivate Plan", planUrl)}
        ${renderSignOff()}
      `,
      { preheader: `Your ${input.previousPlanLabel} plan has ended.` }
    )
  };
}

export function buildTrialEndingSoonEmail() {
  const title = "Your free trial ends in 48 hours";
  const planUrl = "https://snapquote.us/app/plan";

  return {
    subject: title,
    text: `${title}

Hey there, just a heads up — your free trial ends in 48 hours. After that you'll be moved to the Solo plan with 5 credits per month.

Want to keep your full access? Upgrade before your trial ends: ${planUrl}

— The SnapQuote team`,
    html: renderEmailShell(
      title,
      `
        ${renderParagraph(
          "Hey there, just a heads up — your free trial ends in <strong>48 hours</strong>. After that you’ll be moved to the Solo plan with 5 credits per month."
        )}
        ${renderParagraph("Want to keep your full access? Upgrade before your trial ends.")}
        ${renderButton("Upgrade Plan", planUrl)}
        ${renderSignOff()}
      `,
      { preheader: "48 hours left on your free trial." }
    )
  };
}

export function buildPaymentFailedEmail() {
  const title = "Your SnapQuote payment failed";
  const planUrl = "https://snapquote.us/app/plan";

  return {
    subject: title,
    text: `${title}

Hey there, we weren't able to process your latest payment. Please update your payment method to keep your plan active.

Update your payment method: ${planUrl}

If you've already resolved this, you can safely ignore this email.

— The SnapQuote team`,
    html: renderEmailShell(
      title,
      `
        ${renderParagraph(
          "Hey there, we weren’t able to process your latest payment. Please update your payment method to keep your plan active."
        )}
        ${renderParagraph("If you’ve already resolved this, you can safely ignore this email.")}
        ${renderButton("Update Payment Method", planUrl)}
        ${renderSignOff()}
      `,
      { preheader: "Update your payment method to keep your plan active." }
    )
  };
}

export function buildEstimateAcceptedEmail(input: {
  customerName: string;
  serviceType: string;
  acceptedPrice: number | null;
  leadUrl: string;
}) {
  const title = `${input.customerName} accepted your estimate`;
  const acceptedPrice = input.acceptedPrice != null ? toCurrency(input.acceptedPrice) : "Accepted";

  return {
    subject: title,
    text: `${title}\n\nService: ${input.serviceType}\nAccepted price: ${acceptedPrice}\n\nView lead: ${input.leadUrl}`,
    html: renderEmailShell(
      title,
      `
        ${renderParagraph("Good news. A customer accepted your estimate and is ready for the next step.")}
        ${renderField("Customer", input.customerName)}
        ${renderField("Service", input.serviceType)}
        ${renderField("Accepted price", acceptedPrice)}
        ${renderButton("View Lead", input.leadUrl)}
      `,
      { preheader: `${input.customerName} accepted at ${acceptedPrice}.` }
    )
  };
}

export function buildEstimateExpiringSoonEmail(input: { quoteUrl: string }) {
  const title = "Your estimate is expiring soon";

  return {
    subject: title,
    text: `${title}\n\nHey there, a customer hasn't responded to your estimate yet and it expires in 24 hours. You may want to follow up directly.\n\nView estimate: ${input.quoteUrl}\n\n— The SnapQuote team`,
    html: renderEmailShell(
      title,
      `
        ${renderParagraph(
          "Hey there, a customer hasn’t responded to your estimate yet and it expires in <strong>24 hours</strong>. You may want to follow up directly."
        )}
        ${renderButton("View Estimate", input.quoteUrl)}
        ${renderSignOff()}
      `,
      { preheader: "An estimate is about to expire — consider following up." }
    )
  };
}

export function buildEstimateExpiredEmail(input: { leadUrl: string }) {
  const title = "Your estimate has expired";

  return {
    subject: title,
    text: `${title}\n\nHey there, your estimate was not accepted before it expired. If you'd still like to win this job, consider reaching out to the customer directly.\n\nView lead: ${input.leadUrl}\n\n— The SnapQuote team`,
    html: renderEmailShell(
      title,
      `
        ${renderParagraph(
          "Hey there, your estimate was not accepted before it expired. If you’d still like to win this job, consider reaching out to the customer directly."
        )}
        ${renderButton("View Lead", input.leadUrl)}
        ${renderSignOff()}
      `,
      { preheader: "Estimate not accepted before it expired." }
    )
  };
}

export function buildAccountDeletedEmail() {
  const title = "Your SnapQuote account has been deleted";

  return {
    subject: title,
    text: `${title}

Hey there, this is a confirmation that your SnapQuote account has been deleted. All associated data has been permanently removed from our systems.

If you didn't request this or believe it was a mistake, please contact us at support@snapquote.us.

— The SnapQuote team`,
    html: renderEmailShell(
      title,
      `
        ${renderParagraph(
          "Hey there, this is a confirmation that your SnapQuote account has been deleted. All associated data has been permanently removed from our systems."
        )}
        ${renderParagraph(
          "If you didn’t request this or believe it was a mistake, please contact us at <a href=\"mailto:support@snapquote.us\" style=\"color:#2563EB;text-decoration:underline;\">support@snapquote.us</a>."
        )}
        ${renderSignOff()}
      `,
      { preheader: "Account deletion confirmation." }
    )
  };
}

export function buildCreditPurchaseConfirmationEmail(input: {
  creditAmount: number;
  amountPaid: string | null;
  newBalance: number | null;
}) {
  const title = `${input.creditAmount} bonus credits added to your account`;

  return {
    subject: title,
    text: `${title}

Thanks for the purchase! ${input.creditAmount} bonus credits have been added to your SnapQuote account.

${input.newBalance != null ? `Your new bonus credit balance is ${input.newBalance}.` : ""}
${input.amountPaid ? `Amount charged: ${input.amountPaid}` : ""}

Bonus credits never expire and are used after your monthly credits run out.

— The SnapQuote team`,
    html: renderEmailShell(
      title,
      `
        ${renderParagraph(
          `Thanks for the purchase! <strong>${input.creditAmount} bonus credits</strong> have been added to your SnapQuote account.`
        )}
        ${
          input.newBalance != null
            ? renderParagraph(
                `Your new bonus credit balance is <strong>${input.newBalance}</strong>.`
              )
            : ""
        }
        ${
          input.amountPaid
            ? renderParagraph(`Amount charged: <strong>${esc(input.amountPaid)}</strong>`)
            : ""
        }
        ${renderParagraph(
          "Bonus credits never expire and are used after your monthly credits run out."
        )}
        ${renderSignOff()}
      `,
      { preheader: `${input.creditAmount} bonus credits added.` }
    )
  };
}

export function buildTrialExpiredEmail() {
  const title = "Your SnapQuote trial has ended";
  const planUrl = "https://snapquote.us/app/plan";

  return {
    subject: title,
    text: `${title}

Hey there, your SnapQuote free trial has ended and your account has been moved to the Solo plan (5 credits per month).

Want your full access back? You can upgrade any time:

${planUrl}

— The SnapQuote team`,
    html: renderEmailShell(
      title,
      `
        ${renderParagraph(
          "Hey there, your SnapQuote free trial has ended and your account has been moved to the <strong>Solo plan</strong> (5 credits per month)."
        )}
        ${renderParagraph("Want your full access back? You can upgrade any time.")}
        ${renderButton("Upgrade Plan", planUrl)}
        ${renderSignOff()}
      `,
      { preheader: "Your free trial has ended." }
    )
  };
}

export function buildTeamMemberJoinedEmail(input: { inviteeEmail: string }) {
  const title = "A teammate just joined your SnapQuote workspace";
  const teamUrl = "https://snapquote.us/app/team";

  return {
    subject: title,
    text: `${title}

${input.inviteeEmail} accepted your invite and is now part of your SnapQuote team.

Manage your team: ${teamUrl}

— The SnapQuote team`,
    html: renderEmailShell(
      title,
      `
        ${renderParagraph(
          `<strong>${esc(input.inviteeEmail)}</strong> accepted your invite and is now part of your SnapQuote team.`
        )}
        ${renderButton("Manage Team", teamUrl)}
        ${renderSignOff()}
      `,
      { preheader: `${input.inviteeEmail} joined your team.` }
    )
  };
}

export function buildEstimateNotViewedNudgeEmail(input: {
  customerName: string;
  daysSinceSent: number;
  quoteUrl: string;
}) {
  const title = `${input.customerName} hasn’t opened your estimate yet`;

  return {
    subject: title,
    text: `${title}

It's been ${input.daysSinceSent} days since you sent ${input.customerName} an estimate and they haven't opened it yet. A quick follow-up text or call usually does the trick.

View estimate: ${input.quoteUrl}

— The SnapQuote team`,
    html: renderEmailShell(
      title,
      `
        ${renderParagraph(
          `It’s been <strong>${input.daysSinceSent} days</strong> since you sent <strong>${esc(input.customerName)}</strong> an estimate and they haven’t opened it yet. A quick follow-up text or call usually does the trick.`
        )}
        ${renderButton("View Estimate", input.quoteUrl)}
        ${renderSignOff()}
      `,
      { preheader: `${input.customerName} hasn’t opened your estimate.` }
    )
  };
}

// ---------------------------------------------------------------------------
// Referral program email (2026-05-20)
//
// Single template sent twice per org max — once on first lead, once on
// first paid-plan conversion, subject to a 3-week minimum gap between
// the two. See lib/referralEmails.ts for the trigger orchestration.
//
// The CTA links to /dashboard/my-link with an anchor that scrolls the
// MyLink page to the "Refer a Contractor" section at the bottom (the
// card showing the contractor's own code + share link). Logged-in users
// land directly; signed-out users hit /login first and are redirected
// back via the existing auth flow.
// ---------------------------------------------------------------------------
export function buildReferralProgramEmail() {
  const subject = "Earn 3 months of Business free for every contractor you refer";
  const preheader =
    "Share your link — when a contractor you refer upgrades, you get the credit.";
  const headline = "Refer a contractor, earn 3 months free";
  const ctaUrl = "https://snapquote.us/dashboard/my-link#refer-a-contractor";

  const textBody = `${headline}

You know other contractors — and SnapQuote works better the more of them are on it.

Here's the offer: every contractor you refer who signs up for a paid plan earns you 3 months of the Business plan free — a $120 account credit. No limit. Refer five, earn five.

It's simple. Your referral link is in your dashboard. Share it however you want — text it, post it, hand it out. When someone signs up through your link and upgrades to a paid plan, the credit lands on your account automatically.

Get your referral link: ${ctaUrl}

The credit applies to your bill on its own — nothing to redeem, nothing to enter.

— The SnapQuote team`;

  const html = renderEmailShell(
    headline,
    `
      ${renderParagraph(
        "You know other contractors — and SnapQuote works better the more of them are on it."
      )}
      ${renderParagraph(
        "Here’s the offer: every contractor you refer who signs up for a paid plan earns you 3 months of the Business plan free — a <strong>$120 account credit</strong>. No limit. Refer five, earn five."
      )}
      ${renderParagraph(
        "It’s simple. Your referral link is in your dashboard. Share it however you want — text it, post it, hand it out. When someone signs up through your link and upgrades to a paid plan, the credit lands on your account automatically."
      )}
      ${renderButton("Get your referral link", ctaUrl)}
      ${renderParagraph(
        "The credit applies to your bill on its own — nothing to redeem, nothing to enter."
      )}
      ${renderSignOff()}
    `,
    { preheader }
  );

  return { subject, text: textBody, html };
}
