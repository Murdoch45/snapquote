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
  message?: unknown;
  exception?: { values?: Array<{ value?: unknown }> };
};

// Audit 13 M2 — Node's `[DEP0169] DeprecationWarning: url.parse()` is
// emitted from inside Next.js / Vercel runtime internals (no app code in
// this repo calls `url.parse` directly — verified via grep). The warning
// surfaces in Sentry via `captureConsoleIntegration` because Node emits
// it on stderr/console.error. Filter it out at ingest so the Sentry
// budget isn't drowned in third-party deprecation noise. Exported for
// `beforeSend` to call before `scrubSentryEvent`.
const NOISE_PATTERNS = [/\[DEP0169\]/, /DEP0169.*url\.parse/i];
export function isKnownSentryNoise(event: SentryEventLike): boolean {
  const candidates: unknown[] = [event.message];
  if (event.exception?.values) {
    for (const ev of event.exception.values) {
      candidates.push(ev.value);
    }
  }
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    if (NOISE_PATTERNS.some((re) => re.test(candidate))) return true;
  }
  return false;
}

// Audit 13 M7 — extract searchable tags from Postgres permission_denied
// errors (and other PG error codes) before they're scrubbed. Sentry's
// "title" is server-derived from message + exception value; after UUID
// redaction the title becomes "permission denied for organization
// [uuid]" — useful but unsearchable by tenant. Stash the UUID and code
// as tags so support can filter by `pg_error_code:42501` or `org_id:...`
// without leaking the UUID into the event title.
const PG_ERROR_PATTERN = /"code"\s*:\s*"(\d{5})"/;
const ORG_UUID_PATTERN = /organization\s+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

function extractDiagnosticTags(event: SentryEventLike): Record<string, string> {
  const sources: string[] = [];
  if (typeof event.message === "string") sources.push(event.message);
  if (event.exception?.values) {
    for (const ev of event.exception.values) {
      if (typeof ev.value === "string") sources.push(ev.value);
    }
  }
  const out: Record<string, string> = {};
  for (const src of sources) {
    const pgMatch = src.match(PG_ERROR_PATTERN);
    if (pgMatch && !out.pg_error_code) out.pg_error_code = pgMatch[1];
    const orgMatch = src.match(ORG_UUID_PATTERN);
    if (orgMatch && !out.org_id) out.org_id = orgMatch[1];
  }
  return out;
}

// Audit 4 M6 — UUIDs leak into Sentry titles/messages when database errors
// (e.g. "permission denied for organization 8f939f96-...") are thrown.
// `scrubPii` only walks key NAMES — it can't catch a UUID embedded in a
// free-form error message string. This regex catches v4-style UUIDs anywhere
// in a string and replaces them with the literal "[uuid]" so the surrounding
// error context is preserved for debugging while the tenant identifier is not.
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
function redactUuids(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return value.replace(UUID_PATTERN, "[uuid]");
}

/**
 * Scrub PII from a Sentry event payload before it's sent. Keeps stack
 * traces and other debug-relevant fields intact. Always returns the
 * event (never null) — callers wanting to drop events should call
 * `isKnownSentryNoise` first in their `beforeSend` hook.
 */
export function scrubSentryEvent<E extends SentryEventLike>(event: E): E {
  // Audit 13 M7 — stamp diagnostic tags BEFORE UUID redaction so the
  // org_id stays searchable even after the message itself is scrubbed.
  const diagnosticTags = extractDiagnosticTags(event);
  if (Object.keys(diagnosticTags).length > 0) {
    event.tags = { ...(event.tags ?? {}), ...diagnosticTags };
  }

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
      data: b.data ? scrubPii(b.data) : b.data,
      message: redactUuids(b.message)
    }));
  }

  // Audit 4 M6 — strip UUIDs from free-form error message strings (the tenant
  // identifier in "permission denied for organization 8f939f96-..." style
  // messages is the canonical leak shape).
  if (event.message !== undefined) {
    event.message = redactUuids(event.message);
  }
  if (event.exception?.values) {
    event.exception.values = event.exception.values.map((entry) => ({
      ...entry,
      value: redactUuids(entry.value)
    }));
  }

  return event;
}
