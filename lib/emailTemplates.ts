import { buildQuoteLink, getCustomerFirstName } from "@/lib/quote-template";
import { formatCurrencyRange, toCurrency } from "@/lib/utils";

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function renderEmailShell(title: string, bodyHtml: string) {
  return `
    <div style="margin:0;padding:32px 16px;background:#f8fafc;font-family:'DM Sans',Arial,sans-serif;color:#0f172a;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
        <div style="padding:24px 24px 8px;">
          <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;font-weight:700;">SnapQuote</div>
          <h1 style="margin:12px 0 0;font-size:24px;line-height:1.2;color:#0f172a;">${esc(title)}</h1>
        </div>
        <div style="padding:24px;">
          ${bodyHtml}
        </div>
        <div style="padding:0 24px 24px;">
          <div style="border-top:1px solid #e2e8f0;padding-top:16px;font-size:12px;line-height:1.6;color:#94a3b8;">
            <div>SnapQuote · snapquote.us · support@snapquote.us</div>
            <div>This is a transactional email related to your service request or account.</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function renderButton(label: string, href: string) {
  return `
    <a
      href="${esc(href)}"
      style="display:inline-block;margin-top:24px;padding:12px 18px;border-radius:10px;background:#2563EB;color:#ffffff;text-decoration:none;font-weight:700;"
    >
      ${esc(label)}
    </a>
  `;
}

export function renderField(label: string, value: string) {
  return `
    <div style="margin-top:12px;padding:14px 16px;border-radius:12px;background:#f8fafc;border:1px solid #e2e8f0;">
      <div style="font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;">${esc(label)}</div>
      <div style="margin-top:6px;font-size:15px;line-height:1.5;color:#0f172a;">${esc(value)}</div>
    </div>
  `;
}

export function buildEstimateSentEmail(input: {
  businessName: string;
  contractorPhone: string | null;
  contractorEmail: string | null;
  estimateLow: number;
  estimateHigh: number;
  publicId: string;
}) {
  const quoteUrl = buildQuoteLink(input.publicId);
  const title = `You have a new estimate from ${input.businessName}`;
  const priceRange =
    formatCurrencyRange(input.estimateLow, input.estimateHigh) ??
    `${toCurrency(input.estimateLow)} - ${toCurrency(input.estimateHigh)}`;

  return {
    subject: title,
    text: `${title}\n\nEstimated price: ${priceRange}\nPhone: ${input.contractorPhone ?? "Not provided"}\nEmail: ${input.contractorEmail ?? "Not provided"}\n\nView estimate: ${quoteUrl}`,
    html: renderEmailShell(
      title,
      `
        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155;">
          Your estimate is ready. Review the price range below and reach out to your contractor if you have any questions.
        </p>
        ${renderField("Estimate range", priceRange)}
        ${renderField("Contractor", input.businessName)}
        ${renderField("Phone", input.contractorPhone ?? "Not provided")}
        ${renderField("Email", input.contractorEmail ?? "Not provided")}
        ${renderButton("View Estimate", quoteUrl)}
      `
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
        <p style="margin:0 0 16px;font-size:28px;line-height:1.2;font-weight:700;color:#0f172a;">
          ${esc(input.businessName)}
        </p>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155;">
          Thanks for reaching out! We received your request and will be in touch shortly with your estimate.
        </p>
        ${renderField("Phone", input.businessPhone ?? "Not provided")}
        ${renderField("Email", input.businessEmail ?? "Not provided")}
        <p style="margin:16px 0 0;font-size:13px;line-height:1.7;color:#64748b;">
          If you don't see this email in your inbox, please check your spam or junk folder.
        </p>
      `
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
        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155;">
          A new job request just came in and is ready for review.
        </p>
        ${renderField("Service", input.serviceType)}
        ${renderField("Location", input.cityState)}
        ${renderField("AI estimate", estimateRange)}
        ${renderButton("View Lead", input.leadUrl)}
      `
    )
  };
}

export function buildWelcomeEmail() {
  const title = "Welcome to SnapQuote 👋";
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
— The SnapQuote Team`,
    html: renderEmailShell(
      title,
      `
        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155;">
          Hey there, welcome to SnapQuote — you're all set to start receiving job
          requests and sending AI-powered estimates.
        </p>
        <p style="margin:0 0 8px;font-size:15px;line-height:1.7;color:#334155;">
          Here's how to get rolling:
        </p>
        <ul style="margin:0 0 16px;padding-left:20px;font-size:15px;line-height:1.7;color:#334155;">
          <li>Share your request link so customers can submit jobs to you.</li>
          <li>Unlock leads you're interested in.</li>
          <li>Send estimates in seconds with AI.</li>
        </ul>
        ${renderButton("Open Dashboard", dashboardUrl)}
        <p style="margin:24px 0 0;font-size:15px;line-height:1.7;color:#334155;">
          Let's get to work.<br/>
          — The SnapQuote Team
        </p>
      `
    )
  };
}

export function buildPlanUpgradedEmail(input: {
  planLabel: string;
  monthlyCredits: number;
  seatLimit: number;
}) {
  const title = `You're on the ${input.planLabel} plan 🎉`;

  return {
    subject: title,
    text: `${title}

Hey there, your plan has been upgraded to ${input.planLabel}. You now have ${input.monthlyCredits} credits per month and ${input.seatLimit} team ${
      input.seatLimit === 1 ? "seat" : "seats"
    }.

Thanks for growing with us.
— The SnapQuote Team`,
    html: renderEmailShell(
      title,
      `
        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155;">
          Hey there, your plan has been upgraded to <strong>${esc(input.planLabel)}</strong>.
          You now have <strong>${input.monthlyCredits} credits per month</strong> and
          <strong>${input.seatLimit} team ${input.seatLimit === 1 ? "seat" : "seats"}</strong>.
        </p>
        ${renderButton("Open Dashboard", "https://snapquote.us/app")}
        <p style="margin:24px 0 0;font-size:15px;line-height:1.7;color:#334155;">
          Thanks for growing with us.<br/>
          — The SnapQuote Team
        </p>
      `
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

— The SnapQuote Team`,
    html: renderEmailShell(
      title,
      `
        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155;">
          Hey there, your <strong>${esc(input.previousPlanLabel)}</strong> subscription has
          ended and your account has been moved to the <strong>Solo</strong> plan. You'll
          still have access to SnapQuote with 5 credits per month.
        </p>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155;">
          If this was a mistake or you'd like to reactivate, you can upgrade anytime.
        </p>
        ${renderButton("Reactivate Plan", planUrl)}
        <p style="margin:24px 0 0;font-size:15px;line-height:1.7;color:#334155;">
          — The SnapQuote Team
        </p>
      `
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

— The SnapQuote Team`,
    html: renderEmailShell(
      title,
      `
        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155;">
          Hey there, just a heads up — your free trial ends in <strong>48 hours</strong>.
          After that you'll be moved to the Solo plan with 5 credits per month.
        </p>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155;">
          Want to keep your full access? Upgrade before your trial ends.
        </p>
        ${renderButton("Upgrade Plan", planUrl)}
        <p style="margin:24px 0 0;font-size:15px;line-height:1.7;color:#334155;">
          — The SnapQuote Team
        </p>
      `
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

— The SnapQuote Team`,
    html: renderEmailShell(
      title,
      `
        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155;">
          Hey there, we weren't able to process your latest payment. Please update
          your payment method to keep your plan active.
        </p>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155;">
          If you've already resolved this, you can safely ignore this email.
        </p>
        ${renderButton("Update Payment Method", planUrl)}
        <p style="margin:24px 0 0;font-size:15px;line-height:1.7;color:#334155;">
          — The SnapQuote Team
        </p>
      `
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
        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155;">
          Good news. A customer accepted your estimate and is ready for the next step.
        </p>
        ${renderField("Customer", input.customerName)}
        ${renderField("Service", input.serviceType)}
        ${renderField("Accepted price", acceptedPrice)}
        ${renderButton("View Lead", input.leadUrl)}
      `
    )
  };
}
