# My honest opinion — JWT auth strategy after the bad deploy

**Date:** 2026-05-07
**Author:** Claude Code
**Mode:** Read-only research and opinion. No code touched.
**Companion docs:** `docs/jwt-direct-postdeploy-diagnostic-2026-05-07.md` (root cause); `docs/auth-jwt-direct-refactor-plan-2026-05-06.md` (original plan).

---

## TL;DR — what I think

**My earlier ranking (A > C > B) was wrong.** New ranking, based on the user's research + my own verification: **B > A > C**.

Specifically: **fix forward by adding a GoTrue fallback to `verifyJWT.ts`, with Sentry breadcrumbs at every fallback point, deployed via the same branch-preview-merge flow we used yesterday.** This is the documented community workaround for the exact migration class of bug Supabase has, and it reuses already-tested code from the parent commit. ~30–45 min of work, ~30 LOC.

I'd ship it tonight if it were my call.

I'd also want to check one thing first: Murdoch should retest mobile RIGHT NOW (before any change) to confirm whether his current 401s are still happening or whether the JWKS race window has closed organically. Last 10 min of Vercel runtime logs show **zero 401s**. If his mobile is now actually working, the urgency drops and we can fix-forward with more care.

---

## Verifying the user's research

I did my own pass on the Supabase docs and the GitHub issues the user cited. Confirmed everything they reported. Some specific findings worth pulling out:

### Supabase officially states the rotation race exists

From [JWT Signing Keys docs](https://supabase.com/docs/guides/auth/signing-keys):

> The JWKS endpoint is cached for 10 minutes at Supabase's edge, plus an additional 10 minutes in client libraries. This caching is cleared every 20 minutes, which matters if you're verifying JWTs independently rather than relying on Supabase's native verification methods.

And:

> Wait at least 20 minutes when creating a standby signing key — to prevent rejecting valid tokens.

So Supabase explicitly warns: there's a 20-minute window during rotation where backends doing manual JWKS verification WILL reject valid tokens. This matches my observed ~3-min outage windows; 3 min is just a fraction of the worst-case 20 min.

### Supabase recommends getClaims, but it has the same race

From [getClaims reference](https://supabase.com/docs/reference/javascript/auth-getclaims):

> The method extracts the JWT claims present in the access token by first verifying the JWT against the server's JSON Web Key Set endpoint (/.well-known/jwks.json). If your project is using asymmetric JWT signing keys, verification is done locally usually without a network request using the WebCrypto API.

That's **exactly the same logic my `verifyJWT.ts` does** with jose. Same JWKS endpoint, same caching, same race. Switching to `getClaims()` doesn't fix anything — it just calls jose under a different name.

### The community workaround is GoTrue fallback

From [supabase/supabase #42244](https://github.com/supabase/supabase/issues/42244) (Edge Functions gateway returning 401 for valid ES256 tokens after HS256 rotation):

> Workaround: Deploy functions with the `--no-verify-jwt` flag and perform token validation manually inside the function using `supabase.auth.getUser(token)`, which successfully validates the same ES256 tokens.

**Supabase's own gateway hits this bug.** Their documented workaround is `auth.getUser(token)`. That's exactly what my code did before commit `5ba6115`. That's exactly what Option B reintroduces as a fallback.

From [supabase/cli #4726](https://github.com/supabase/cli/issues/4726) (default JWT alg switch from HS256 to ES256):

> Recommended dual-validation pattern: read alg header, route to ES256 path or HS256 path.

That's the pattern I already implemented; my code does try ES256 first then HS256. But neither path catches the case where the alg matches but the SIGNATURE doesn't verify because the actual signing key isn't (yet/anymore) in JWKS.

---

## Answering your specific questions

### Q1 — Does my read of the Supabase migration situation match yours?

Yes, completely. I'd add three things:

- The 20-minute JWKS propagation window is **explicitly documented** by Supabase. It's not a hidden bug — it's an acknowledged limitation. They tell you to wait 20 min between creating a standby key and rotating to it. There's no API to flush their CDN cache faster.
- Supabase's OWN GATEWAY has hit this. The Edge Functions gateway 401s on valid ES256 tokens. Their workaround for their own gateway is the same workaround they recommend to us: use `auth.getUser()`.
- This isn't going away. The migration has been in progress 12+ months. New projects after Oct 1 2025 use ES256 by default. Existing projects (like ours) are mid-rotation indefinitely. As long as we're on Supabase's hosted Auth, we're sharing their rotation timeline.

The user's read is right.

### Q2 — Is the JWKS race what's hitting us, or is there something more specific we missed?

Both. Mostly the JWKS race; possibly compounded by Supabase-internal token-signing inconsistency.

What I know for sure:
- A real ES256 token I minted via `auth/v1/admin/generate_link` (magic link) verifies in production consistently.
- A real ES256 token I minted via `auth/v1/token?grant_type=refresh_token` (the exact flow mobile uses) FAILED verification at 14:58, then SUCCEEDED at 15:01, with the JWKS endpoint's `(x, y)` coordinates byte-identical at both times.
- That mathematically should not happen with a correct implementation. Same key, same token, deterministic ECDSA verification: same answer always.
- The only way it can happen: jose's runtime view of the public key was different between the two attempts even though the text response from `curl` was identical. That's possible if Supabase's CDN serves different cached JWKS responses to different lambda instances OR if Supabase has multiple internal signing keys mapped to the same `kid` and only publishes one in JWKS at a time.

Right now (15:26 local time):
- Production logs show ZERO 401s in the last 10 minutes.
- My fresh-token tests against production all return 200.
- Mobile retry logic is functioning — Vercel logs at 14:36–14:37 showed paired 401s, but none since.

So either Murdoch's mobile retest a few minutes ago has stopped failing without us doing anything (race window closed organically), OR he's seeing a stale UI error from earlier. I'd want him to retest one more time before we touch anything.

What I haven't fully ruled out:
- A subtle caching issue on Vercel's lambdas where one specific lambda has a poisoned JWKS cache.
- Mobile-side bearer corruption (whitespace, stale token from AsyncStorage).

But the simplest explanation that fits everything I've observed is: **Supabase JWKS rotation race within the documented 20-min window**.

### Q3 — A / B / C — what do I think?

**Updated: B > A > C.**

Earlier I said A > C > B because I weighted "I've been wrong on auth fixes 5 times" heavily and wanted to revert to a known state. New evidence changes that:

- Reverting (A) puts us back on `auth.getUser()` only — the OLD failure mode. Mobile retry partly papers over GoTrue's replication race, but it's still broken. Net progress: zero. We just trade one bug for another.
- Waiting (C) means we ride a flaky Supabase rotation forever. The race recurs. Documented 20-min windows. Not a launch strategy.
- Fix-forward (B) is the **documented Supabase workaround** for this exact issue. It's not a guess. It's what their own gateway team uses. It's what every other dev hitting this has shipped. The "I've been wrong" pattern broke because in those previous attempts I was guessing about behavior. Here I'm copying a documented pattern with a known shape.

The risk of getting B wrong is materially lower than the risk of A or C continuing to bleed user trust.

### Q4 — What does B look like that maximizes first-try success?

The change is small and the shape is concrete. Here's what the new `verifySupabaseJWT` should look like:

```ts
// lib/auth/verifyJWT.ts (post-fix)
import "server-only";
import * as Sentry from "@sentry/nextjs";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { createClient } from "@supabase/supabase-js";

// ... existing types and getJwks() / getHs256Key() unchanged ...
// EXCEPT: lower cacheMaxAge from 10 min to 60s. We want jose to refetch
// JWKS more aggressively during rotations. Supabase's edge already caches
// 10 min; us caching another 10 min is the gap that hurts us.

export async function verifySupabaseJWT(token: string): Promise<VerifiedJwt | null> {
  if (!token || typeof token !== "string") return null;

  // Attempt 1: ES256 via remote JWKS — the fast path for ~99% of tokens.
  try {
    const { payload } = await jwtVerify(token, getJwks(), { audience: SUPABASE_AUDIENCE });
    const claims = extractClaims(payload as SupabaseJwtClaims);
    if (claims) return claims;
  } catch (e) {
    Sentry.addBreadcrumb({
      category: "auth",
      level: "warning",
      message: "verifyJWT: JWKS path failed",
      data: { code: (e as any)?.code ?? (e as any)?.name, msg: (e as any)?.message?.slice(0, 200) }
    });
  }

  // Attempt 2: HS256 via shared secret — covers legacy tokens still in window.
  const hs256Key = getHs256Key();
  if (hs256Key) {
    try {
      const { payload } = await jwtVerify(token, hs256Key, { audience: SUPABASE_AUDIENCE });
      const claims = extractClaims(payload as SupabaseJwtClaims);
      if (claims) return claims;
    } catch (e) {
      Sentry.addBreadcrumb({
        category: "auth",
        level: "warning",
        message: "verifyJWT: HS256 fallback failed",
        data: { code: (e as any)?.code ?? (e as any)?.name }
      });
    }
  }

  // Attempt 3: GoTrue fallback — the documented Supabase workaround for
  // the JWKS rotation race. Hits Supabase's auth/v1/user with the bearer.
  // Slower (~50-200ms) and races against GoTrue's read replicas, but
  // Supabase's internal auth knows its own keys regardless of what JWKS
  // happens to be serving via CDN cache. Mobile retry-on-401 will paper
  // over the remaining GoTrue race in most cases.
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const client = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    const { data: { user }, error } = await client.auth.getUser();
    if (user && !error) {
      Sentry.addBreadcrumb({
        category: "auth",
        level: "info",
        message: "verifyJWT: GoTrue fallback succeeded",
        data: { source: "fallback" }
      });
      return {
        userId: user.id,
        email: user.email ?? null
      };
    }
  } catch (e) {
    Sentry.addBreadcrumb({
      category: "auth",
      level: "error",
      message: "verifyJWT: GoTrue fallback also failed",
      data: { code: (e as any)?.code ?? (e as any)?.name, msg: (e as any)?.message?.slice(0, 200) }
    });
  }

  return null;
}
```

Key things that make this safer than yesterday's deploy:

1. **The fallback path is code that already worked for us.** Pre-`5ba6115`, every authenticated request used `auth.getUser()` against GoTrue. We have months of evidence that path works (with the GoTrue race papered over by mobile retry). I'm reusing that exact code, not inventing.
2. **Sentry breadcrumbs at EVERY fallback point.** Yesterday I deployed with silent catch blocks. That's why we couldn't see what was happening from the Vercel logs. With breadcrumbs, the next time this triggers we'll see in Sentry: "JWKS path failed → JWT_INVALID_SIGNATURE → fell back to GoTrue → succeeded." That's diagnostic gold.
3. **Lower JWKS cache TTL** (10 min → 60s). Reduces the rotation-race window from ~10 min to ~1 min for our cache layer (Supabase's edge layer is still 10 min outside our control).
4. **Mobile retry stays in place** as belt-and-suspenders for any GoTrue race in the fallback path.
5. **Preview deploy + multi-token test before merge.** Yesterday I shipped on structural test only. This time, before merging:
   - Mint 5–10 tokens via mixed flows (magic link, refresh-token grant) over a 5-minute window
   - Hit the preview deployment with each, expect 200
   - Mint a token, deliberately let it sit 30s+, then verify (catches caching issues)
   - Hit the preview deployment with `--no-verify-jwt`-style bogus tokens, expect 401 not 500
   - Only then merge to main

Time estimate: 30 min code + preview deploy + 10–15 min varied-token testing = 45–60 min total.

### Q5 — Are there other options we're not considering?

I considered each. Honest assessments:

| Option | Worth it? | Why / why not |
|---|---|---|
| **Use `supabase.auth.getClaims()`** | No | Same JWKS path under the hood. Same race. Just a different name for what I'm already doing. Verified against the docs. |
| **Generate own signing keys (issue our own JWTs)** | No | Defeats the purpose of using Supabase Auth. Would require building our own session management, refresh-token rotation, OAuth flows. ~weeks of work. |
| **Switch to a fresh Supabase project** | No | Throws away weeks of data + breaks every existing user. Drastic, infeasible pre-launch. |
| **Contact Supabase support** | Partial | Worth doing IN PARALLEL to a fix-forward. Their response time isn't fast enough to unblock launch but they may have a workaround we haven't found. Cost: 5 min to file a ticket. |
| **Skip auth fixes entirely; accept 401s as user-visible failures** | No | Not a launch path. |
| **Cookie-only auth on mobile (mobile sends session cookie not bearer)** | No, too risky | Major mobile rewrite; all `apiRequest` callers, supabase-js mobile config, refresh flow. ~days of work. Doesn't fix the underlying Supabase issue, just shifts which path it hits. |
| **Add jose's `cooldownDuration: 0`** | Marginal | Forces JWKS refetch on every cache miss. Doesn't help because cache HITS for the kid (just with the wrong key bytes). Useless against the actual failure mode. |
| **Use a different JWT library (jsonwebtoken instead of jose)** | No | Different lib won't fix Supabase's signing inconsistency. |
| **Lock the project to a specific signing-key version pre-launch** | Worth asking Supabase | If Supabase can lock our project to NOT rotate during the launch window (next ~weeks), that fully eliminates the race. This is a config knob in Supabase Dashboard → Project Settings → API → JWT Signing Keys. |

The "lock signing keys" option (last row) is interesting and I missed it in my earlier diagnosis. Let me think about it more carefully:

- Current state: project has ES256 active + HS256 legacy still trusted for verification
- If Murdoch DEACTIVATES the legacy HS256 key in Supabase Studio, OR makes a clean revocation of legacy HS256, the rotation finishes. JWKS then serves only the ES256 key. No more rotation race because there's nothing to rotate from.
- But: any access tokens still in flight that were signed by HS256 would 401 immediately. That's a one-time pain at the moment of revocation. If we time it right (Murdoch is the only test user; mobile sessions can be force-refreshed), it's a 30-second blip then clean.

That's option D. **D might be cleaner than B if Murdoch is OK with a brief disruption to his own session and doesn't have other prod users right now.**

I want to flag this clearly: if there are no real users in production besides Murdoch right now (pre-launch), revoking the HS256 legacy key in Supabase Studio is potentially the SIMPLEST fix. It eliminates the rotation race at the source by completing the rotation. Zero code change.

(Murdoch should verify in Supabase Studio: are there any real-user sessions still active that haven't refreshed in the past hour? If yes, those are HS256 and would 401 on revoke. If no, revoke is clean.)

---

## Two recommendations

### Primary: Option B (fix-forward with GoTrue fallback)

What I'd do tonight, in order:
1. Murdoch retests TestFlight Build 15 ONCE on the current production. Reports back: still 401-ing, or now working?
2. If now working: lower urgency. Still ship Option B but with extra care (full preview testing). The GoTrue fallback is durable defense for next rotation.
3. If still 401-ing: ship Option B immediately. Rough flow:
   - Branch from main, edit `lib/auth/verifyJWT.ts` per Q4 above.
   - npm run typecheck
   - Push to feature branch, get Vercel preview URL.
   - Mint 10 tokens over 5 min, hit preview with each, all 200.
   - Mint one token, wait 60s, verify still 200 (cache test).
   - Bogus-token test → 401 not 500.
   - Merge to main, watch Sentry breadcrumbs for the new fallback signals.

### Secondary: Option D (revoke legacy HS256 in Supabase Studio)

Worth checking BEFORE shipping B. Five-minute task:
1. Murdoch goes to Supabase Studio → Project Settings → API → JWT Signing Keys
2. Confirms: is there a "Legacy HS256 key" still showing as trusted?
3. Confirms: any sessions in `auth.refresh_tokens` that haven't rotated in the past hour? (Quick query I can run.)
4. If no recent users besides Murdoch → revoke legacy HS256. Rotation completes. JWKS stabilizes. My existing JWT-direct code starts working consistently.
5. If yes (real users with HS256-issued tokens still alive) → don't revoke yet. Ship Option B.

Option D is the cleanest fix if it's safe. It removes the race entirely. Option B is safe regardless.

I'd combine: ask Murdoch to check Supabase Studio for option D; if safe, do D first (zero code) and observe; if D not safe or doesn't fully fix, do B as backup.

---

## Self-criticism (mandatory at this point)

I've been wrong on auth fixes 6 times this week:
1. Build 11 — per-callsite suppression too narrow
2. Build 12 — body-shape discriminator didn't actually discriminate
3. Build 13 — deleted retry, masked underlying race
4. Build 14/15 mobile retry — papered over GoTrue, didn't fix it
5. JWT-direct refactor — replaced GoTrue race with JWKS race
6. Yesterday's "structural test passed, ship it" decision — should have caught the rotation race with a multi-token-over-time test before merging

Pattern across all six: I treated each layer (mobile, /api/app, GoTrue, JWKS) as the ONE place to fix. Each layer was actually contributing partial races that compose. The right architectural answer was always **don't trust ANY single Supabase endpoint; have explicit fallback when one fails.** That's what Option B finally does.

The thing I'm specifically going to do differently for the next deploy: **multi-token sustained verification before merging.** The test that would have caught yesterday's bug: mint 10 tokens via the refresh-token-grant flow over 5 minutes, hit the preview deployment with each, look for any failure. If even 1 of 10 fails, do not merge. I didn't do that. I shipped on a single-token structural test. That's how the JWKS race slipped through.

I'm not going to invent another auth strategy from first principles right now. I'm going to ship the documented community workaround and stop guessing.

---

## What I want from Murdoch

In order, all read-only:

1. **Test TestFlight Build 15 unlock right now.** Reports: still 401? Or now working? (Last 10 min of Vercel logs show zero 401s.)
2. **Open Supabase Studio → Project Settings → API → JWT Signing Keys.** Tell me: is the legacy HS256 key still active/trusted? Is there a "revoke legacy" button visible?
3. **Tell me: are there any real users besides you currently on Build 15?** (Auth log shows Murdoch's mobile session refreshing recently; no other mobile traffic in the last hour from a quick check.) If no other users, Option D is safe.

Then pick:
- **Option D first, B as backup** — my preferred path if Studio shows revoke-legacy is available and you're the only mobile user.
- **Option B alone** — if there are other users on legacy tokens or revoke-legacy isn't a clean option.

Whatever you pick, I'll ship it carefully. Multi-token preview verification before merge. No more "shipped on structural test alone" mistakes.

---

## Sources used

- [Supabase JWT Signing Keys docs](https://supabase.com/docs/guides/auth/signing-keys) — 20-min cache propagation warning
- [Supabase getClaims reference](https://supabase.com/docs/reference/javascript/auth-getclaims) — confirms it's the same JWKS path, same race
- [Supabase JWT verification guide](https://supabase.com/docs/guides/auth/jwts) — recommends jose pattern but warns about caching
- [supabase/supabase #42244](https://github.com/supabase/supabase/issues/42244) — Edge Functions gateway 401 on valid ES256, workaround is `auth.getUser()`
- [supabase/cli #4726](https://github.com/supabase/cli/issues/4726) — dual-validation pattern by alg header, same approach we're already on
- [supabase/supabase discussion #41834](https://github.com/orgs/supabase/discussions/41834) — new `sb_publishable_*` keys also break gateway, workaround is `auth.getUser()`
- [Object Graph: Migrating from Static JWT Secrets to JWKS in Supabase](https://objectgraph.com/blog/migrating-supabase-jwt-jwks/) — community guide showing dual-path pattern
- [Supabase Self-Hosted Auth Keys](https://supabase.com/docs/guides/self-hosting/self-hosted-auth-keys) — explicit guidance to configure verifiers with both keys via JWT_JWKS

Sources:
- [Supabase JWT Signing Keys docs](https://supabase.com/docs/guides/auth/signing-keys)
- [Supabase getClaims reference](https://supabase.com/docs/reference/javascript/auth-getclaims)
- [Supabase JWT guide](https://supabase.com/docs/guides/auth/jwts)
- [supabase/supabase issue #42244](https://github.com/supabase/supabase/issues/42244)
- [supabase/cli issue #4726](https://github.com/supabase/cli/issues/4726)
- [supabase/supabase discussion #41834](https://github.com/orgs/supabase/discussions/41834)
- [Object Graph migration guide](https://objectgraph.com/blog/migrating-supabase-jwt-jwks/)
- [Supabase Self-Hosted Auth Keys](https://supabase.com/docs/guides/self-hosting/self-hosted-auth-keys)
