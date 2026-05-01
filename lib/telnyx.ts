import "server-only";

type SendQuoteSmsInput = {
  to: string;
  body: string;
  // Optional idempotency key forwarded to Telnyx as the `Idempotency-Key`
  // header. When set, Telnyx deduplicates retries so the customer is only
  // texted once even if the send route is re-entered (double-click, retry,
  // etc.). The send route derives this key from the quote id.
  idempotencyKey?: string;
};

export const TELNYX_API_URL = "https://api.telnyx.com/v2/messages";

// Single source of truth for the SMS sender. lib/notify.ts imports this
// so changing the production From number is a one-line edit. Default is
// the 10DLC-campaign-approved number; override via env for staging /
// alternate-campaign testing.
export const TELNYX_FROM_NUMBER =
  process.env.TELNYX_FROM_NUMBER?.trim() || "+17169938159";

// 10DLC compliance footer. US carriers require an opt-out instruction on
// A2P SMS, especially on the first message in a conversation. The default
// estimate template includes this as the closing line, but contractors can
// edit their template in profile settings — appending it again at send
// time guarantees the outbound message is always compliant regardless of
// what the contractor chose. Already-compliant messages aren't double-
// appended; we detect "reply stop" case-insensitively.
const SMS_OPT_OUT_FOOTER = "Reply STOP to opt out.";

export function ensureSmsOptOutFooter(body: string): string {
  if (/reply\s+stop/i.test(body)) return body;
  const trimmed = body.replace(/\s+$/, "");
  return `${trimmed}\n\n${SMS_OPT_OUT_FOOTER}`;
}

// Matches the retry policy used by Resend in lib/notify.ts so email and
// SMS behave consistently on the send path. Three attempts, exponential
// backoff (500ms, 1s, 1.5s) on transient failures (network, 5xx, 429).
// Permanent failures (4xx other than 429) fail fast — retrying an invalid
// phone number or an auth problem will only fail the same way.
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;

function getTelnyxApiKey(): string {
  const apiKey = process.env.TELNYX_API_KEY;
  if (!apiKey) {
    throw new Error("Missing TELNYX_API_KEY");
  }
  return apiKey;
}

function isRetryableStatus(status: number): boolean {
  // Rate limits (429) and all server errors (5xx) are worth retrying.
  // 4xx (400/401/403/404/422 etc.) means the request itself is bad — the
  // number is invalid, the key was rotated, the account is suspended.
  // Retrying those just wastes quota.
  if (status === 429) return true;
  return status >= 500 && status <= 599;
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendQuoteSms({ to, body, idempotencyKey }: SendQuoteSmsInput): Promise<string> {
  const apiKey = getTelnyxApiKey();
  const compliantBody = ensureSmsOptOutFooter(body);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
  if (idempotencyKey) {
    headers["Idempotency-Key"] = idempotencyKey;
  }

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response: Response;
    try {
      response = await fetch(TELNYX_API_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({
          from: TELNYX_FROM_NUMBER,
          to,
          text: compliantBody
        })
      });
    } catch (error) {
      // Network / DNS / timeout — always transient.
      lastError =
        error instanceof Error
          ? error
          : new Error(`Telnyx send network error: ${String(error)}`);
      if (attempt < MAX_ATTEMPTS) {
        await delay(RETRY_BASE_DELAY_MS * attempt);
        continue;
      }
      throw lastError;
    }

    if (response.ok) {
      const json = (await response.json()) as { data?: { id?: string } };
      return json.data?.id ?? "";
    }

    let detail = "";
    try {
      const errBody = await response.json();
      detail = JSON.stringify(errBody);
    } catch {
      detail = await response.text().catch(() => "");
    }

    const message = `Telnyx send failed (${response.status} ${response.statusText}): ${detail}`;
    lastError = new Error(message);

    if (!isRetryableStatus(response.status) || attempt === MAX_ATTEMPTS) {
      throw lastError;
    }

    await delay(RETRY_BASE_DELAY_MS * attempt);
  }

  // Unreachable — the loop either returns on success or throws. Preserved
  // so the type checker can see a definite exit.
  throw lastError ?? new Error("Telnyx send failed: unknown error");
}
