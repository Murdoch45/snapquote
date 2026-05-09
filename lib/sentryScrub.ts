/**
 * Shared Sentry PII scrubber. Used by sentry.{server,edge,client}.config.ts
 * `beforeSend` and `beforeBreadcrumb` hooks.
 *
 * The audit (Audit 8 H6) flagged that we have no PII scrubbing on the way
 * out to Sentry — customer names/phones/emails/addresses can leak into
 * `event.extra`, `event.contexts`, breadcrumb data, request bodies, etc.
 * This module walks the event payload and redacts known-sensitive keys,
 * leaving stack traces and non-PII metadata untouched so error-debugging
 * still works.
 */

const REDACTED = "[redacted]";

// Substring match (lowercased). Matches both top-level keys (`email`) and
// snake/camel variants (`customer_email`, `customerEmail`).
const SENSITIVE_KEY_FRAGMENTS = [
  "email",
  "phone",
  "address",
  "customer_name",
  "customername",
  "first_name",
  "firstname",
  "last_name",
  "lastname",
  "full_name",
  "fullname",
  "ssn",
  "tax_id",
  "taxid",
  "password",
  "secret",
  "token",
  "api_key",
  "apikey",
  "authorization",
  "auth_token",
  "access_token",
  "refresh_token",
  "session",
  "cookie",
  "credit_card",
  "card_number",
  "cvc",
  "cvv",
  "ip_address",
  "ipaddress",
  "lat",
  "lng",
  "latitude",
  "longitude"
];

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) => lower.includes(fragment));
}

// Redact a value when its key looks sensitive. Walk objects and arrays
// recursively. Bound depth to defeat circular references / pathological
// payloads.
const MAX_DEPTH = 8;

export function scrubPii<T>(value: T, depth = 0): T {
  if (depth > MAX_DEPTH) return REDACTED as unknown as T;
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.map((item) => scrubPii(item, depth + 1)) as unknown as T;
  }

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(k)) {
        out[k] = REDACTED;
      } else {
        out[k] = scrubPii(v, depth + 1);
      }
    }
    return out as unknown as T;
  }

  // Primitive — leave alone. We deliberately don't try to detect PII inside
  // strings (regex on every string would be expensive and noisy). Caller is
  // responsible for not stuffing PII into stringified blobs.
  return value;
}

type SentryEventLike = {
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  user?: Record<string, unknown>;
  request?: { data?: unknown; cookies?: unknown; headers?: unknown };
  breadcrumbs?: Array<{ data?: unknown; message?: unknown }>;
  tags?: Record<string, unknown>;
};

/**
 * Scrub PII from a Sentry event payload before it's sent. Keeps stack
 * traces and other debug-relevant fields intact. Returns `null` to drop
 * the event (we never do that here — always return the event).
 */
export function scrubSentryEvent<E extends SentryEventLike>(event: E): E {
  if (event.extra) event.extra = scrubPii(event.extra);
  if (event.contexts) event.contexts = scrubPii(event.contexts);
  if (event.tags) event.tags = scrubPii(event.tags);

  // event.user — Sentry's own field. id is fine to keep; everything else
  // (email, ip_address, username) is treated as PII.
  if (event.user) {
    const { id, ...rest } = event.user as { id?: unknown } & Record<string, unknown>;
    event.user = id !== undefined ? { id, ...scrubPii(rest) } : scrubPii(rest);
  }

  if (event.request) {
    if (event.request.data) event.request.data = scrubPii(event.request.data);
    if (event.request.cookies) event.request.cookies = REDACTED;
    if (event.request.headers) event.request.headers = scrubPii(event.request.headers);
  }

  if (Array.isArray(event.breadcrumbs)) {
    event.breadcrumbs = event.breadcrumbs.map((b) => ({
      ...b,
      data: b.data ? scrubPii(b.data) : b.data
    }));
  }

  return event;
}
