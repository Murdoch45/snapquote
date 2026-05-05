import { Resend } from "resend";

import { toE164UsPhone } from "@/lib/phone";
import { TELNYX_API_URL, TELNYX_FROM_NUMBER, ensureSmsOptOutFooter } from "@/lib/telnyx";

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
  /**
   * Optional idempotency key forwarded to Resend. When set, Resend
   * deduplicates identical send calls so a double-clicked contractor
   * Send button doesn't result in the customer receiving the same
   * estimate email twice. The send route derives this key from the
   * quote id.
   */
  idempotencyKey?: string;
};

// TELNYX_API_URL and TELNYX_FROM_NUMBER are imported from lib/telnyx.ts
// so the production sender is configured in exactly one place.

// Match the retry policy used by Resend below so SMS and email behave
// consistently under transient provider failure.
const SMS_MAX_ATTEMPTS = 3;
const SMS_RETRY_BASE_DELAY_MS = 500;

// Per-attempt timeout for outbound provider calls (Telnyx, Resend). A
// hung fetch with no signal would keep the calling Vercel function alive
// past maxDuration — and on the customer-form submit path, this was
// directly responsible for "Sending..." stalling 60+ seconds before
// notifications were moved into after(). Even after that move, the
// timeout is defense-in-depth so a slow provider can't pin the function
// instance for the rest of its budget.
const PROVIDER_FETCH_TIMEOUT_MS = 8000;

const telnyxConfigured = Boolean(process.env.TELNYX_API_KEY);
const resendConfigured = Boolean(process.env.RESEND_API_KEY);

let resendClient: Resend | null = null;

function getResendClient(): Resend {
  if (!resendClient) resendClient = new Resend(process.env.RESEND_API_KEY as string);
  return resendClient;
}

function isRetryableSmsStatus(status: number): boolean {
  if (status === 429) return true;
  return status >= 500 && status <= 599;
}

export async function sendSms(to: string, body: string): Promise<boolean> {
  if (!telnyxConfigured) {
    console.warn("Telnyx sendSms skipped: TELNYX_API_KEY missing.");
    return false;
  }

  // Normalize to E.164. Telnyx rejects 10-digit / formatted phones with
  // 40310 "Invalid 'to' address". This site historically logged the
  // failure to Sentry but kept the bad-format phone in the DB; the fix
  // is to normalize at the boundary so the same SMS that failed before
  // would now go through.
  const normalizedTo = toE164UsPhone(to);
  if (!normalizedTo) {
    console.error(`Telnyx sendSms skipped: cannot normalize 'to' to E.164: ${to}`);
    return false;
  }

  // 10DLC compliance footer is appended at send time so every outbound
  // message carries the opt-out instruction, regardless of where the body
  // was constructed. ensureSmsOptOutFooter is idempotent (won't double-
  // append if the body already has "Reply STOP").
  const compliantBody = ensureSmsOptOutFooter(body);

  for (let attempt = 1; attempt <= SMS_MAX_ATTEMPTS; attempt++) {
    let response: Response;
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(new Error(`Telnyx sendSms timed out after ${PROVIDER_FETCH_TIMEOUT_MS}ms`)),
      PROVIDER_FETCH_TIMEOUT_MS
    );
    try {
      response = await fetch(TELNYX_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.TELNYX_API_KEY as string}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: TELNYX_FROM_NUMBER,
          to: normalizedTo,
          text: compliantBody
        }),
        signal: controller.signal
      });
    } catch (error) {
      console.error(`Telnyx sendSms network error (attempt ${attempt}/${SMS_MAX_ATTEMPTS}):`, error);
      if (attempt < SMS_MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, SMS_RETRY_BASE_DELAY_MS * attempt));
        continue;
      }
      return false;
    } finally {
      clearTimeout(timeoutId);
    }

    if (response.ok) return true;

    let detail = "";
    try {
      const errBody = await response.json();
      detail = JSON.stringify(errBody);
    } catch {
      detail = await response.text().catch(() => "");
    }
    console.error(
      `Telnyx sendSms failed (attempt ${attempt}/${SMS_MAX_ATTEMPTS}, ${response.status} ${response.statusText}): ${detail}`
    );

    if (!isRetryableSmsStatus(response.status) || attempt === SMS_MAX_ATTEMPTS) {
      return false;
    }

    await new Promise((resolve) => setTimeout(resolve, SMS_RETRY_BASE_DELAY_MS * attempt));
  }

  return false;
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
      // The Resend SDK's emails.send() doesn't expose an AbortController
      // signal directly, so we race it against a timeout promise. The SDK
      // call keeps running in the background after a timeout reject, but
      // since we always retry or return false, the orphaned promise's
      // result is ignored — and after() will be done by then anyway.
      const result = await Promise.race([
        getResendClient().emails.send(
          {
            from: fromEmail,
            to: input.to,
            subject: input.subject,
            text: input.text,
            html: input.html,
            ...(input.replyTo ? { replyTo: input.replyTo } : {})
          },
          input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined
        ),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Resend sendEmail timed out after ${PROVIDER_FETCH_TIMEOUT_MS}ms`)),
            PROVIDER_FETCH_TIMEOUT_MS
          )
        )
      ]);
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
