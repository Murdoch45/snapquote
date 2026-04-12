import { Resend } from "resend";

type SenderKey = "transactional" | "noreply";

type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /**
   * Which configured sender to use. "transactional" (default) is the
   * customer-facing estimates@ address; "noreply" is for contractor
   * lifecycle emails (welcome, plan changes, trial ending) where reply
   * should be discouraged.
   */
  sender?: SenderKey;
  /**
   * Optional Reply-To header. Used on customer-facing emails so a reply
   * routes back to the contractor's own inbox instead of estimates@.
   */
  replyTo?: string | null;
};

const TELNYX_API_URL = "https://api.telnyx.com/v2/messages";
const TELNYX_FROM_NUMBER = "+17169938159";

const telnyxConfigured = Boolean(process.env.TELNYX_API_KEY);
const resendConfigured = Boolean(process.env.RESEND_API_KEY);

let resendClient: Resend | null = null;

function getResendClient(): Resend {
  if (!resendClient) resendClient = new Resend(process.env.RESEND_API_KEY as string);
  return resendClient;
}

export async function sendSms(to: string, body: string): Promise<boolean> {
  if (!telnyxConfigured) {
    console.warn("Telnyx sendSms skipped: TELNYX_API_KEY missing.");
    return false;
  }
  try {
    const response = await fetch(TELNYX_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.TELNYX_API_KEY as string}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: TELNYX_FROM_NUMBER,
        to,
        text: body
      })
    });

    if (!response.ok) {
      let detail = "";
      try {
        const errBody = await response.json();
        detail = JSON.stringify(errBody);
      } catch {
        detail = await response.text().catch(() => "");
      }
      console.error(
        `Telnyx sendSms failed (${response.status} ${response.statusText}): ${detail}`
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error("Telnyx sendSms error:", error);
    return false;
  }
}

function resolveFromAddress(sender: SenderKey): string {
  if (sender === "noreply") {
    const noreply = process.env.RESEND_FROM_EMAIL_NOREPLY;
    if (noreply && !noreply.includes("@resend.dev")) return noreply;
    return "SnapQuote <noreply@snapquote.us>";
  }

  const transactional = process.env.RESEND_FROM_EMAIL;
  if (transactional && !transactional.includes("@resend.dev")) return transactional;
  return "SnapQuote <estimates@snapquote.us>";
}

export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  if (!resendConfigured) {
    console.warn("Resend sendEmail skipped: RESEND_API_KEY missing.");
    return false;
  }

  const fromEmail = resolveFromAddress(input.sender ?? "transactional");
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await getResendClient().emails.send({
        from: fromEmail,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
        ...(input.replyTo ? { replyTo: input.replyTo } : {})
      });
      if (result.error) {
        console.error(`Resend sendEmail API error (attempt ${attempt}/${maxAttempts}):`, result.error);
        if (attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
          continue;
        }
        return false;
      }
      return Boolean(result.data?.id);
    } catch (error) {
      console.error(`Resend sendEmail error (attempt ${attempt}/${maxAttempts}):`, error);
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
        continue;
      }
      return false;
    }
  }

  return false;
}

export async function notifyCustomer(opts: {
  phone?: string | null;
  email?: string | null;
  smsBody: string;
  emailSubject: string;
  emailBody: string;
}): Promise<("sms" | "email")[]> {
  const sent: ("sms" | "email")[] = [];
  if (opts.phone) {
    const smsSent = await sendSms(opts.phone, opts.smsBody);
    if (smsSent) sent.push("sms");
  }
  if (opts.email) {
    const emailSent = await sendEmail({
      to: opts.email,
      subject: opts.emailSubject,
      text: opts.emailBody
    });
    if (emailSent) sent.push("email");
  }
  return sent;
}

export async function notifyContractor(opts: {
  smsEnabled: boolean;
  emailEnabled: boolean;
  phone?: string | null;
  email?: string | null;
  smsBody: string;
  emailSubject: string;
  emailBody: string;
}): Promise<("sms" | "email")[]> {
  const sent: ("sms" | "email")[] = [];
  if (opts.smsEnabled && opts.phone) {
    if (!process.env.TELNYX_API_KEY) {
      console.warn("Telnyx SMS skipped: missing TELNYX_API_KEY.");
    } else {
      const ok = await sendSms(opts.phone, opts.smsBody);
      if (ok) sent.push("sms");
    }
  }
  if (opts.emailEnabled && opts.email) {
    const ok = await sendEmail({
      to: opts.email,
      subject: opts.emailSubject,
      text: opts.emailBody
    });
    if (ok) sent.push("email");
  } else {
    if (opts.email) {
      console.warn("notifyContractor email skipped.");
    }
  }
  return sent;
}
