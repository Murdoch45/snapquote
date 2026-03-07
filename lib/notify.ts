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
  if (!twilioConfigured) return false;
  await getTwilioClient().messages.create({
    to,
    from: process.env.TWILIO_FROM_NUMBER as string,
    body
  });
  return true;
}

export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  if (!resendConfigured) return false;
  await getResendClient().emails.send({
    from: process.env.RESEND_FROM_EMAIL as string,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html
  });
  return true;
}

export async function notifyCustomer(opts: {
  phone?: string | null;
  email?: string | null;
  smsBody: string;
  emailSubject: string;
  emailBody: string;
}): Promise<"sms" | "email" | "none"> {
  if (opts.phone) {
    const sent = await sendSms(opts.phone, opts.smsBody);
    if (sent) return "sms";
  }
  if (opts.email) {
    const sent = await sendEmail({
      to: opts.email,
      subject: opts.emailSubject,
      text: opts.emailBody
    });
    if (sent) return "email";
  }
  return "none";
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
    const ok = await sendSms(opts.phone, opts.smsBody);
    if (ok) sent.push("sms");
  }
  if (opts.emailEnabled && opts.email) {
    const ok = await sendEmail({
      to: opts.email,
      subject: opts.emailSubject,
      text: opts.emailBody
    });
    if (ok) sent.push("email");
  }
  return sent;
}
