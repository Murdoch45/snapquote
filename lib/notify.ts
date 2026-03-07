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
    process.env.TWILIO_FROM_NUMBER
);

const resendConfigured = Boolean(
  process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL
);

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
    const result = await getTwilioClient().messages.create({
      to,
      from: process.env.TWILIO_FROM_NUMBER as string,
      body
    });
    console.log("Twilio sendSms result:", {
      sid: result.sid,
      status: result.status,
      to
    });
    return true;
  } catch (error) {
    console.error("Twilio sendSms error:", error);
    return false;
  }
}

export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  if (!resendConfigured) {
    console.warn("Resend sendEmail skipped: RESEND_API_KEY or RESEND_FROM_EMAIL missing.");
    return false;
  }
  try {
    const result = await getResendClient().emails.send({
      from: process.env.RESEND_FROM_EMAIL as string,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html
    });
    console.log("Resend sendEmail result:", result);
    return true;
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
  console.log("notifyCustomer called:", {
    hasPhone: Boolean(opts.phone),
    hasEmail: Boolean(opts.email),
    email: opts.email ?? null,
    subject: opts.emailSubject
  });

  const sent: ("sms" | "email")[] = [];
  if (opts.phone) {
    const smsSent = await sendSms(opts.phone, opts.smsBody);
    if (smsSent) sent.push("sms");
  } else {
    console.log("notifyCustomer SMS skipped: no phone provided.");
  }
  if (opts.email) {
    const emailSent = await sendEmail({
      to: opts.email,
      subject: opts.emailSubject,
      text: opts.emailBody
    });
    if (emailSent) sent.push("email");
  } else {
    console.log("notifyCustomer email skipped: no email provided.");
  }

  console.log("notifyCustomer completed:", { sent });
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
  console.log("notifyContractor called:", {
    smsEnabled: opts.smsEnabled,
    emailEnabled: opts.emailEnabled,
    hasPhone: Boolean(opts.phone),
    hasEmail: Boolean(opts.email),
    email: opts.email ?? null,
    subject: opts.emailSubject
  });

  const sent: ("sms" | "email")[] = [];
  if (opts.smsEnabled && opts.phone) {
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      console.warn("Twilio SMS skipped: missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN.");
    } else {
      const ok = await sendSms(opts.phone, opts.smsBody);
      if (ok) sent.push("sms");
    }
  } else {
    console.log("notifyContractor SMS skipped:", {
      smsEnabled: opts.smsEnabled,
      hasPhone: Boolean(opts.phone)
    });
  }
  if (opts.emailEnabled && opts.email) {
    const ok = await sendEmail({
      to: opts.email,
      subject: opts.emailSubject,
      text: opts.emailBody
    });
    if (ok) sent.push("email");
  } else {
    console.log("notifyContractor email skipped:", {
      emailEnabled: opts.emailEnabled,
      hasEmail: Boolean(opts.email)
    });
  }
  console.log("notifyContractor completed:", { sent });
  return sent;
}
