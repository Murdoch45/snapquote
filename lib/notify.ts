import twilio from "twilio";
import { Resend } from "resend";

type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

const twilioConfigured = Boolean(
  process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_PHONE_NUMBER
);

const resendConfigured = Boolean(process.env.RESEND_API_KEY);

let twilioClient: ReturnType<typeof twilio> | null = null;
let resendClient: Resend | null = null;

function getTwilioClient(): ReturnType<typeof twilio> {
  if (!twilioClient) {
    twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID as string,
      process.env.TWILIO_AUTH_TOKEN as string
    );
  }
  return twilioClient;
}

function getResendClient(): Resend {
  if (!resendClient) resendClient = new Resend(process.env.RESEND_API_KEY as string);
  return resendClient;
}

export async function sendSms(to: string, body: string): Promise<boolean> {
  if (!twilioConfigured) {
    console.warn("Twilio sendSms skipped: Twilio is not fully configured.");
    return false;
  }
  try {
    await getTwilioClient().messages.create({
      to,
      from: process.env.TWILIO_PHONE_NUMBER as string,
      body
    });
    return true;
  } catch (error) {
    console.error("Twilio sendSms error:", error);
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
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      console.warn("Twilio SMS skipped: missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN.");
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
