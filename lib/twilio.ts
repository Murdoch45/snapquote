import "server-only";

import twilio from "twilio";

type SendQuoteSmsInput = {
  to: string;
  body: string;
};

let client: ReturnType<typeof twilio> | null = null;

function getTwilioClient(): ReturnType<typeof twilio> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;

  if (!sid || !token) {
    throw new Error("Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN");
  }

  if (!client) {
    client = twilio(sid, token);
  }

  return client;
}

function getTwilioPhoneNumber(): string {
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_FROM_NUMBER;
  if (!phoneNumber) {
    throw new Error("Missing TWILIO_PHONE_NUMBER");
  }
  return phoneNumber;
}

export async function sendQuoteSms({ to, body }: SendQuoteSmsInput): Promise<string> {
  const result = await getTwilioClient().messages.create({
    to,
    from: getTwilioPhoneNumber(),
    body
  });

  return result.sid;
}
