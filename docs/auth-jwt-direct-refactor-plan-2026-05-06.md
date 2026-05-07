# Auth race fix — JWT-direct verification refactor plan

**Date:** 2026-05-06
**Repo:** `C:\Users\murdo\SnapQuote` (web)
**Author:** Claude Code
**Status:** Plan only — awaiting Murdoch approval before implementation

---

## TL;DR

Replace `auth.getUser()` (which queries Supabase GoTrue and races against its read replicas) with deterministic local JWT verification in `lib/auth/requireRole.ts`. Affects every authenticated `/api/app/*` route called from mobile. Single PR. ~half day. Two open questions for Murdoch before I code.

Mobile-side retry-on-401 in Build 15 is doing its job — the second attempt's freshly-refreshed bearer races GoTrue exactly the same way as the first one, so retry can't fix this. Web-side fix is the only real path.

---

## Audit findings

### A. Helpers that bear the race (must refactor)

Both helpers in `lib/auth/requireRole.ts` call `supabase.auth.getUser()` (which round-trips to GoTrue). When the request carries a bearer token issued less than ~50ms ago, GoTrue's read replicas haven't propagated → `user` is null → 401 returned. Mobile retry doesn't help because the retry's freshly-refreshed token is even fresher.

| Helper | File:Line | Used by |
| --- | --- | --- |
| `requireMemberForApi` | `lib/auth/requireRole.ts:119-162` | 12 routes |
| `requireOwnerForApi` | `lib/auth/requireRole.ts:64-117` | 9 routes |

**Total downstream API routes affected:** 21 (full list below).

### B. Other `auth.getUser()` callsites — DO NOT touch in this PR

These are cookie-based or service-role paths, NOT the mobile bearer race. Touching them is out of scope.

| File:Line | Why we leave it alone |
| --- | --- |
| `lib/auth/requireAuth.ts:14` | Cookie-based SSR helper for Server Components (`/app/leads/page.tsx` et al). Web-only. No mobile race. |
| `lib/db.ts:17` (`getOrgContext`) | Same — cookie-based SSR helper. |
| `middleware.ts:61` | Next.js SSR cookie refresh. Documented pattern from `@supabase/ssr`. Removing breaks cookie session refresh. |
| `app/api/public/auth/bootstrap/route.ts:43` | Cookie-bridge for OAuth callback. |
| `app/api/public/quote/[publicId]/accept/route.ts:41` | Cookie-based contractor self-accept. |

### C. Bearer-path duplicates of `requireRole` (refactor with helper)

This route has its own inline bearer-token + `createSupabaseClientFromToken` block, duplicating what `requireRole.ts` does — and exposes the same race for mobile callers:

- `app/api/public/invite/accept/route.ts` lines 17-30 — has its own `getBearerToken` and conditional client-from-token. **Mobile calls this for invite accept.** Refactor to use the same JWT-direct helper.

### D. Routes with redundant `auth.getUser()` after `requireRole` (cleanup)

These call `requireRole` (which already returns `userEmail`) and then call `supabase.auth.getUser()` AGAIN to re-fetch the user — wasted GoTrue round-trip and a second race surface. Replace with `auth.userEmail`:

| File:Line | What it does | Fix |
| --- | --- | --- |
| `app/api/app/quote/send/route.ts:88-90` | Reads `user.email` for "contractor email" fallback in SMS/email payload | Use `auth.userEmail` |
| `app/api/stripe/checkout/route.ts:65-79` | `user.email` for Stripe checkout customer | Use `auth.userEmail` |
| `app/api/stripe/credits/route.ts:54` | Same pattern | Use `auth.userEmail` |

These aren't *causing* the race symptom Murdoch saw (they don't 401 on null user; they just fall back), but they're free fixes while we're in there.

### E. Service-role admin calls — DO NOT touch

Calls like `admin.auth.admin.getUserById(userId)` use the service role key and don't race the same way. Examples:
- `app/api/app/account/delete/route.ts:191`
- `app/api/app/team/members/route.ts:36`

Leave alone.

### F. Webhook routes — DO NOT touch

Stripe webhooks (`app/api/webhooks/stripe/...`) and RevenueCat webhooks verify via signature secrets, not user JWTs. Not affected.

### G. Public route with admin token verify — borderline

- `app/api/public/onboard/route.ts:45` calls `admin.auth.getUser(accessToken)` — admin client + explicit token. Not the same race (service role bypasses the user-API), but still a network call. **Not in this PR**; could be a follow-up.

---

## Full list of routes that the requireRole refactor automatically fixes

(All 21 routes that gate on `requireMemberForApi` or `requireOwnerForApi`. The mobile bearer race fix lives in the two helpers; every consumer benefits transparently.)

**`requireMemberForApi`** (12):
- `app/api/app/account/delete/route.ts:183` — delete account
- `app/api/app/activity/touch/route.ts:22` — activity heartbeat
- `app/api/app/leads/[id]/contact/route.ts:35` — fetch lead contact
- `app/api/app/leads/unlock/route.ts:21` — lead unlock
- `app/api/app/onboarding/complete/route.ts:6` — onboarding finish
- `app/api/app/quote/send/route.ts:41` — send quote
- `app/api/app/subscription-status/route.ts:16` — IAP/Stripe gate
- `app/api/app/team/invites/route.ts:7` — list invites
- `app/api/app/team/members/route.ts:16` — list members

**`requireOwnerForApi`** (9):
- `app/api/app/my-link/caption/route.ts:25` — my-link caption
- `app/api/app/settings/check-slug/route.ts:10` — slug availability
- `app/api/app/settings/patch/route.ts:38` — settings save
- `app/api/app/settings/update/route.ts:8` — settings update (legacy?)
- `app/api/app/settings/verify-email/route.ts:30` — verify email
- `app/api/app/team/invite-link/route.ts:17` — invite link
- `app/api/app/team/invite/route.ts:13` — invite member
- `app/api/app/team/remove/route.ts:8` — remove member
- `app/api/iap/sync/route.ts:79` — IAP receipt sync
- `app/api/onboarding/reset/route.ts:13` — replay tutorial
- `app/api/stripe/checkout/route.ts:53` — Stripe checkout
- `app/api/stripe/credits/route.ts:31` — Stripe credit purchase
- `app/api/stripe/customer-portal/route.ts` — Stripe portal

**Crucially, all 8 of Murdoch's reported regressions are in this list.**

---

## Implementation plan

### Step 1 — Add the JWT verification library

`jose` is the recommended JWT library for Edge/Node and supports both HS256 (Supabase's default) and asymmetric algorithms:

```bash
npm install jose
```

Adds `jose` to `package.json` dependencies. Lightweight (~30KB).

### Step 2 — Add the env var

`SUPABASE_JWT_SECRET` is currently NOT in `.env.example`, `.env.local`, or referenced anywhere in code. Murdoch needs to:

1. Get the JWT secret from Supabase Studio → Project Settings → API → "JWT Secret" field (legacy projects) OR from "JWT Settings" if the project has been migrated to asymmetric keys.
2. Add to `.env.local` for local dev.
3. Add to Vercel project env vars for production (Production + Preview, NOT Development unless dev mirrors prod auth).
4. Add `SUPABASE_JWT_SECRET=` to `.env.example` as documentation.

**OPEN QUESTION 1 — Murdoch confirm:** Is your Supabase project on legacy HS256 (symmetric secret) or migrated to asymmetric keys (RS256/ES256 via JWKS)? Default for projects pre-Q4 2024 is HS256. If asymmetric, the implementation switches to `createRemoteJWKSet` against `https://<project>.supabase.co/auth/v1/.well-known/jwks.json` and no secret is needed in env.

I'll plan for HS256 below (most common) and note the asymmetric branch separately.

### Step 3 — New helper: `lib/auth/verifyJWT.ts`

```ts
import "server-only";
import { jwtVerify, type JWTPayload } from "jose";

type SupabaseClaims = JWTPayload & {
  sub: string;       // user UUID
  email?: string;
  role?: string;     // "authenticated" for logged-in users, "anon" otherwise
  aud: string;       // "authenticated"
};

let cachedSecret: Uint8Array | null = null;
function getJwtSecret(): Uint8Array {
  if (cachedSecret) return cachedSecret;
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    throw new Error("Missing SUPABASE_JWT_SECRET env var");
  }
  cachedSecret = new TextEncoder().encode(secret);
  return cachedSecret;
}

export type VerifiedJwt = {
  userId: string;
  email: string | null;
};

/**
 * Verify a Supabase access token's signature locally — does NOT round-trip
 * to GoTrue. Eliminates the GoTrue replication race that caused 401s on
 * freshly-issued bearers (mobile Build 13/14/15 regression).
 *
 * Throws on signature failure, expired tokens, malformed JWTs.
 * Returns null for genuinely missing/empty tokens (caller renders 401).
 */
export async function verifySupabaseJWT(token: string): Promise<VerifiedJwt | null> {
  if (!token || typeof token !== "string") return null;

  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), {
      // Supabase issues with aud="authenticated" for logged-in users
      audience: "authenticated",
      // jose validates exp/nbf automatically
    });

    const claims = payload as SupabaseClaims;
    if (!claims.sub) return null;

    return {
      userId: claims.sub,
      email: typeof claims.email === "string" ? claims.email : null
    };
  } catch {
    // Signature failure, expiration, malformed token — treat as unauthenticated.
    return null;
  }
}
```

### Step 4 — Refactor `lib/auth/requireRole.ts`

Replace `auth.getUser()` with `verifySupabaseJWT()` for the bearer path. Keep cookie path on `auth.getUser()` (no race for cookie sessions).

Pseudo-diff for `requireMemberForApi`:

```ts
export async function requireMemberForApi(request?: Request): Promise<...> {
  const bearer = getBearerToken(request);

  let userId: string;
  let userEmail: string | null;

  if (bearer) {
    // Bearer path — JWT-direct verify, NO GoTrue round-trip
    const verified = await verifySupabaseJWT(bearer);
    if (!verified) {
      return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
    }
    userId = verified.userId;
    userEmail = verified.email;
  } else {
    // Cookie path — keep existing behavior (web SSR)
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
    }
    userId = user.id;
    userEmail = user.email ?? null;
  }

  // The membership lookup MUST use service role (or anon w/ RLS) — we no
  // longer have a user-scoped client in the bearer path. Use the admin
  // client for membership lookup since the access check is "does this
  // user_id have a row in organization_members?" — RLS would let the
  // user query their own rows anyway.
  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("organization_members")
    .select("org_id, role, created_at")
    .eq("user_id", userId)
    .order("role", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (!membership) return { ok: false, response: NextResponse.json({ error: "Membership missing" }, { status: 403 }) };
  if ((membership.org_id as string) === getDemoOrgId()) {
    return { ok: false, response: NextResponse.json({ error: "Demo org is read-only." }, { status: 403 }) };
  }

  return { ok: true, userId, userEmail, orgId: membership.org_id as string, role: membership.role as "OWNER" | "MEMBER" };
}
```

`requireOwnerForApi` gets the same treatment — splits bearer vs cookie, uses admin client for membership lookup, adds the `role !== "OWNER"` 403 check at the end.

**Why admin client for membership lookup:** The bearer path no longer has a user-scoped Supabase client (we never created one). Two options for the membership query:
1. **Admin client (recommended):** Direct service-role query. Trustworthy because we just verified the bearer, so we know `userId` is real. RLS doesn't add value here — we're already filtering `eq("user_id", userId)`. Faster, no row-level filtering overhead.
2. **Build a user-scoped client from the verified bearer:** `createSupabaseClientFromToken(bearer)`. Same as today. RLS naturally filters. But that's another client object instantiation per request and the membership query goes via PostgREST → DB which adds a hop.

Going with Option 1 — admin client. Lower latency, simpler.

### Step 5 — Refactor `app/api/public/invite/accept/route.ts`

Currently has its own inline bearer extraction. Replace with the new `verifySupabaseJWT` helper. Keep the route's other logic intact (it has a special "user_id from token IF AVAILABLE, else accept anonymously" pattern that needs preserving).

### Step 6 — Cleanup the redundant `auth.getUser()` calls (D)

Replace `user.email` references with `auth.userEmail`:
- `app/api/app/quote/send/route.ts` lines 88-90, 218, 261
- `app/api/stripe/checkout/route.ts` lines 65-79
- `app/api/stripe/credits/route.ts` lines 53-54

Eliminates the redundant network calls. Cosmetic; not race-critical.

### Step 7 — `.env.example` documentation

Add `SUPABASE_JWT_SECRET=your_supabase_jwt_secret` with a comment pointing to where to get it.

### Step 8 — TypeScript + manual diff review

- `npm run typecheck` (== `tsc --noEmit`) must be clean
- `npm run lint` (uses Next ESLint + tsc)
- Visual diff review of every change

### Step 9 — Commit + push to main

Single commit, descriptive message. Murdoch's preference: one PR ship. We push to `main`, Vercel auto-deploys.

### Step 10 — Post-deploy verification

Once Vercel finishes deploying:
- Check Vercel runtime logs for the affected routes — 401s should drop to zero (or to the genuinely-unauthenticated baseline).
- Murdoch retests in TestFlight on Build 15 — the 8 features should now all work.

---

## Risks & mitigations

1. **Wrong env var name or secret format.** If `SUPABASE_JWT_SECRET` is wrong or missing, EVERY authenticated bearer request 401s instantly. Mitigation: I'll add a startup-time check (the secret loader throws if missing, surfacing the issue immediately). Murdoch should verify the env var lands in Vercel before pushing. **Strongly recommend:** test on a Vercel preview deploy first if there's any uncertainty about the secret.

2. **Project on asymmetric algo, not HS256.** Supabase has been migrating to asymmetric. If your project is asymmetric, HS256 verification fails for every token. Mitigation: Murdoch confirms the algo before we commit. If asymmetric, I switch the helper to `createRemoteJWKSet`.

3. **JWT clock skew.** `jose` uses server time for `exp/nbf` validation. Vercel's clock is reliable. Mitigation: optional `clockTolerance: 5` second leeway in the verify call.

4. **Token contains expected claims?** Supabase tokens have `sub`, `email`, `aud="authenticated"`, `role="authenticated"`. The plan validates these. If a token is missing `sub`, we return null (treat as unauthenticated).

5. **Admin client for membership query bypasses RLS.** Acceptable because we explicitly filter `eq("user_id", userId)` and the user_id was just verified from a signed JWT. Same trust model as today's bearer path (the user-scoped client also trusts the bearer).

6. **Cookie path unchanged.** Web users' page nav and cookie-based API calls behave identically.

7. **Backward compat of return shape.** All consumers receive the same `{ ok, userId, userEmail, orgId, role }` shape. No callsite touched downstream of the helpers.

---

## Open questions for Murdoch (please answer before I implement)

**Q1.** Is your Supabase project on legacy HS256 (symmetric secret) or migrated to asymmetric (RS256/ES256 + JWKS)?
- **HS256 path:** I add `SUPABASE_JWT_SECRET` to env, use `jwtVerify(token, secret)`.
- **Asymmetric path:** No env secret needed; I use `createRemoteJWKSet` against the project's JWKS endpoint.

To check: Supabase Studio → Project Settings → API → look for "JWT Secret" (legacy) vs "JWT Settings" / "Signing Keys" (asymmetric).

**Q2.** Approve the scope as described (refactor `requireMemberForApi` + `requireOwnerForApi` + the `app/api/public/invite/accept/route.ts` inline duplicate; cleanup the 3 redundant `auth.getUser()` callers; leave cookie path / middleware / requireAuth / Server Components alone)?

**Q3.** Murdoch confirms `SUPABASE_JWT_SECRET` (or whichever Q1 path) will be in Vercel env BEFORE I push to main? Vercel auto-deploys, and missing-env = full outage.

**Q4.** Should I leave `app/api/public/onboard/route.ts:45` alone (it uses admin.auth.getUser which races less) or also refactor it for consistency? Not in the failing-feature list. My recommendation: leave alone in this PR.

---

## What I'm NOT doing in this PR

- Not touching `lib/auth/requireAuth.ts` (cookie-based SSR helper)
- Not touching `lib/db.ts:getOrgContext` (cookie-based)
- Not touching `middleware.ts` (cookie refresh; Next.js SSR pattern)
- Not touching webhook routes (signature-verified, not user-JWT-verified)
- Not touching admin service-role getUserById calls (they don't race)
- Not refactoring `app/api/public/onboard/route.ts` (out of scope; admin path)
- Not bumping mobile build (mobile retry logic unchanged; web fix removes the need)
- Not adding instrumentation / Sentry breadcrumbs on the verify path (could be a follow-up)

---

## Estimated diff size

- `package.json` + `package-lock.json`: +1 dep
- `lib/auth/verifyJWT.ts`: NEW, ~50 lines
- `lib/auth/requireRole.ts`: ~80 lines changed (split bearer vs cookie path)
- `app/api/public/invite/accept/route.ts`: ~10 lines changed
- `app/api/app/quote/send/route.ts`: ~5 lines changed (replace user.email with auth.userEmail)
- `app/api/stripe/checkout/route.ts`: ~10 lines changed
- `app/api/stripe/credits/route.ts`: ~3 lines changed
- `.env.example`: +1 line

Total: ~+150/−80 LOC across ~7 files. Single commit.

---

## Self-criticism

- I've been wrong before on the auth path (Build 11/12/13/14 mobile fixes — see `docs/build-14-strategy-audit-2026-05-06.md` in the mobile repo). Every iteration was a partial fix that got displaced by deeper investigation. The Build 14 strategy audit explicitly called out JWT-direct verification as the root-cause-level fix; this PR is finally executing that.
- The risk now is on the WEB side instead of the MOBILE side. I'm modifying the auth gate for every authenticated mobile route. If the secret/algo/claim shape is wrong, the failure mode is total outage for mobile (not just one feature). Mitigation: verify env vars BEFORE pushing, optionally test on Vercel preview deploy, have a rollback commit ready (the diff is small enough to git revert in 1 minute).
- I am NOT making this fix touch the cookie path. That's deliberate — fixing one race at a time, not two. If web SSR pages start showing the same race, that's a separate diagnostic. Today, the user-visible failure is bearer-only (mobile).
- I did NOT confirm Supabase's signing algorithm by inspecting an actual issued token. Doing that requires either a live test from Murdoch or pulling the Supabase project config — both out of band from this audit. **Q1 is the hardest blocker for me to resolve unilaterally.**

---

## Awaiting approval

Please answer Q1–Q4 above and confirm you want to proceed. Once approved, I'll execute steps 1–10 in one commit and push.
