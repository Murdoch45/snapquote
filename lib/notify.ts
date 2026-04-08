import { Resend } from "resend";

type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
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

export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  const fromEmail =
    process.env.RESEND_FROM_EMAIL && !process.env.RESEND_FROM_EMAIL.includes("@resend.dev")
      ? process.env.RESEND_FROM_EMAIL
      : "SnapQuote <estimates@snapquote.us>";

  if (!resendConfigured) {
    console.warn("Resend sendEmail skipped: RESEND_API_KEY missing.");
    return false;
  }

  try {
    const result = await getResendClient().emails.send({
      from: fromEmail as string,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html
    });
    if (result.error) {
      console.error("Resend sendEmail API error:", result.error);
      return false;
    }
    return Boolean(result.data?.id);
  } catch (error) {
    console.error("Resend sendEmail error:", error);
    return false;
  }
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
