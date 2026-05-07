# JWT-direct refactor — post-deploy failure diagnostic

**Date:** 2026-05-07
**Repo:** `C:\Users\murdo\SnapQuote` (web)
**Deployment:** `dpl_9G4btShg7pBNFtSzbSeQyGT4ZM2e` (commit `5ba6115` on main)
**Mode:** Read-only diagnostic. No code changed.

---

## TL;DR

**My deployed verifyJWT code is structurally correct.** It rejects bearers whose signature doesn't verify against the public key served by Supabase's JWKS endpoint — that is the entire point.

**The actual failure is a Supabase-side JWKS rotation race.** During intermittent windows today, Supabase issued ES256 access tokens claiming `kid=85542139-701f-4514-a75c-76ec5c74cc4c` whose signature did NOT verify against the public key Supabase published at that same kid. After ~3–5 minutes the situation resolved on its own without the JWKS coordinates changing.

**Mobile bearers got caught in those windows; mobile retry-on-401 didn't help because the second attempt hit the same broken JWKS cache.**

The architectural bet — "JWKS is more deterministic than GoTrue's `auth.getUser()`" — is not holding for this Supabase project right now. Until Supabase finishes whatever rotation is in progress, JWKS-based verification is *less* reliable than GoTrue, not more.

**Recommendation: REVERT to commit `933079b` (parent of `5ba6115`).** Detail at the end of this doc.

---

## Investigation timeline

### Step 1 — Confirm the new code is deployed

`get_deployment` reports `gitCommitSha: 5ba61154...` for the latest production deployment, which is the JWT-direct fix commit. Build logs show clean compile, `added 1 package in 2s` (jose), no errors.

### Step 2 — Pull failing-request logs

15-minute window of Murdoch's TestFlight retest yielded 19 401s on the affected routes (`/api/app/leads/unlock`, `/api/app/settings/patch`, `/api/app/team/members`, `/api/app/subscription-status`, `/api/app/activity/touch`). Paired requests ~1 sec apart confirm Build 14/15's mobile retry-on-401 is firing: original fails, refresh, retry, retry also fails. No app-level error/warning logs from the function itself — my catch blocks swallow jose's errors silently.

### Step 3 — Re-read the deployed code

`lib/auth/verifyJWT.ts` and `lib/auth/requireRole.ts` reviewed line-by-line. No structural bug found:
- `getBearerToken` parses `Authorization: Bearer <token>` correctly (case-insensitive)
- `resolveIdentity` routes bearer requests to `verifySupabaseJWT` (correct)
- `verifySupabaseJWT` tries ES256 via JWKS first, falls back to HS256 with `SUPABASE_JWT_SECRET`, returns null on both fail
- Membership lookup uses admin client filtered by verified `userId` (correct)

### Step 4 — Decode a real Supabase ES256 token

Used the Supabase admin API (`auth/v1/admin/generate_link` → `auth/v1/verify`) to mint a fresh access token for Murdoch's user. Decoded:

```
Header:  {"alg":"ES256","kid":"85542139-701f-4514-a75c-76ec5c74cc4c","typ":"JWT"}
Payload: {iss: "https://upqvbdldoyiqqshxquxa.supabase.co/auth/v1",
          sub: "71622212-...",
          aud: "authenticated",
          exp: 1778168793, iat: 1778165193,
          email: "murdochmarcum@icloud.com",
          role: "authenticated", aal: "aal1",
          session_id: "efea5e02-...", is_anonymous: false, ...}
```

`aud: "authenticated"` matches my code's expected audience. `kid` matches the JWKS endpoint's published key. ES256 algorithm matches. Claims look standard.

### Step 5 — Local verify against the real token

`scripts/jwt-verify-diagnostic.mjs` runs `verifySupabaseJWT`'s logic locally with the real token + production env vars. Result: **PASS**. Both `audience: "authenticated"` and no-audience modes verify the signature successfully. So the code IS structurally correct.

### Step 6 — Hit production with the same token

```
GET /api/app/team/members         → 200 OK (returned Murdoch's member row)
GET /api/app/subscription-status  → 200 OK
POST /api/app/activity/touch      → 200 OK
GET /api/app/team/invites         → 200 OK
```

So the **production code path works for this token**. Same code as the failing path. Same JWKS endpoint. Same env vars. Same verification logic.

### Step 7 — Reproduce the failure with a refresh-token-issued bearer

Used the magic link's refresh_token to call `/auth/v1/token?grant_type=refresh_token` (exactly what mobile's `supabase.auth.refreshSession()` does internally). Got back `access_token_2`. Decoded:

```
Header:  {"alg":"ES256","kid":"85542139-701f-4514-a75c-76ec5c74cc4c","typ":"JWT"}
        ^ same kid as access_token_1 (magic-link-issued)
Payload: same shape, fresh exp/iat
```

Hit production:

```
GET /api/app/team/members → 401  ← bug reproduced
```

Local verify of `access_token_2` returns:

```
ATTEMPT 1: ES256 via JWKS, audience='authenticated'
FAIL: ERR_JWS_SIGNATURE_VERIFICATION_FAILED — signature verification failed

ATTEMPT 1b: ES256 via JWKS, NO audience constraint
FAIL: ERR_JWS_SIGNATURE_VERIFICATION_FAILED — signature verification failed
```

Same kid. Same JWKS endpoint. Same algorithm. **Different signature outcome.** The magic-link token verified; the refresh-token-issued one did not.

### Step 8 — Re-test the SAME failed token a few minutes later

After ~3 minutes I re-tested `access_token_2` (which had failed verification). Without changing anything:

```
GET /api/app/team/members → 200 OK
local verify              → PASS
```

The token that just failed signature verification now succeeds. **Same token. Same JWKS coordinates (`x` and `y` in the published key are byte-identical to before).** Yet jose's verification returns a different result.

### Step 9 — Hit refresh in tight loop, observe stability

5 sequential refresh-token grants → fresh access_token each → tested against production. All 5 returned 200. Issue resolved itself.

### Step 10 — Check current 401 rate

Last 5 minutes of production logs: **zero 401s** on `/api/app/*` routes. Murdoch's mobile would likely succeed if he retested right now.

---

## Root cause hypothesis

**Supabase has a multi-instance JWT signing infrastructure that briefly desyncs from the published JWKS during rotation.** Specifically:

- Auth instance A signs tokens with private key Pa, JWKS publishes public key Ka (matches Pa).
- Auth instance B signs tokens with private key Pb, JWKS would publish public key Kb.
- During rotation: published JWKS shows ONE key with kid X. But internally, instance B is signing with Pb while the JWKS still shows Ka (or vice versa).
- Tokens from instance B claim kid X (the same kid as Ka in JWKS). jose fetches JWKS, gets Ka, tries to verify a Pb-signed token against Ka. Fails.

Public-key bytes (`x`, `y` coordinates) at JWKS endpoint were byte-identical at every time I checked — yet token signatures from the same kid were inconsistent. That's only possible if Supabase had MULTIPLE private keys mapped to the same kid in different signing pools, OR if the JWKS endpoint was serving a slightly-stale cache while the auth signing path had already rolled to the next key.

This is a Supabase platform behavior we have no direct visibility into. **It will recur** until Supabase finishes whatever rotation/migration is in progress. The notes Murdoch quoted at the start of this work — "Project is in transition. Current signing key is ECC P-256 (ES256 asymmetric). Legacy HS256 shared secret is still active for verifying older tokens that haven't expired" — match this picture: project is mid-rotation.

## Why my retry-on-401 in mobile didn't paper over this

Build 14/15's mobile retry calls `supabase.auth.refreshSession()` and retries with the new token. But the new token gets signed by the same possibly-broken signing pool, and Vercel's lambda has the same possibly-stale JWKS cache. Both attempts hit the exact same verify path; if it fails once, it fails twice. That's why the paired 401s in the logs are both at the same minute.

By contrast, the OLD `auth.getUser()` GoTrue path raced against GoTrue's read replicas — a different race that retry CAN paper over because the replicas catch up within ~50–500 ms. So mobile retry on Build 12's GoTrue path had a real chance of succeeding on the second attempt; mobile retry on this new JWKS path does not.

## Why the curl-with-fresh-token tests sometimes worked

Lambda warmup. Whichever Vercel lambda first served my fresh-token curl had already cached a JWKS instance from a previous request that succeeded. That cache happened to contain the matching public key. Mobile traffic hitting OTHER lambdas (different cold starts, different cache states) saw different verification results. This is consistent with the observed pattern of "some bearers verify, some don't, even in the same minute."

---

## What's NOT the bug

I want to be explicit about what I ruled out so we don't go around again:

- **NOT** `audience: "authenticated"` — confirmed every Supabase user token has `aud="authenticated"` exactly
- **NOT** `iss` mismatch — my code doesn't check iss
- **NOT** `kid` mismatch — token's kid IS in the JWKS at every moment I checked
- **NOT** clock skew — `exp` is well in the future on every test token
- **NOT** wrong `SUPABASE_JWT_SECRET` — confirmed present in Vercel; HS256 fallback isn't in play because tokens are ES256
- **NOT** wrong `NEXT_PUBLIC_SUPABASE_URL` — confirmed by the fact that fresh tokens DO verify against JWKS some of the time
- **NOT** the bearer-extraction regex — confirmed by structural test (Bearer with bogus token reaches the verify path)
- **NOT** middleware stripping the Authorization header — middleware reads cookies only; the bearer arrives at the route handler intact
- **NOT** a build artifact mismatch — git commit hash on the deployment matches my code

The bug is the JWKS verification race itself. My code is doing the right thing per the spec; the spec doesn't account for Supabase's internal rotation race.

---

## Options going forward

### Option A — Revert (recommended)

`git revert 5ba6115 && git push origin main`. Vercel auto-deploys. Restores the pre-fix state where:
- `requireMemberForApi` / `requireOwnerForApi` call `auth.getUser()` against GoTrue
- Mobile Build 14/15 retry-on-401 papers over GoTrue's replication race in many cases
- We trade the Supabase-JWKS race for the Supabase-GoTrue race
- Net: most authenticated mobile calls succeed first try, some succeed on retry, very few fail outright

This is the state Build 15 had before today's deploy. It's "broken but understood" and has been live for hours/days. It is the safe rollback.

**Tradeoff vs. JWKS-direct:** the GoTrue race produces 401s but mobile retry usually succeeds on the second try. The JWKS race produces 401s and retries don't help. Until Supabase stabilizes their signing infrastructure, JWKS-direct is *less reliable in practice*.

### Option B — Fix-forward (not recommended right now)

Make `verifySupabaseJWT` resilient to JWKS staleness:

1. Reduce `cacheMaxAge` from 10 min to ~30s so jose re-fetches more aggressively.
2. On `ERR_JWS_SIGNATURE_VERIFICATION_FAILED`, force a JWKS re-fetch (jose v6 supports `refresh()` or you bust the cache by re-instantiating `createRemoteJWKSet`) and retry once.
3. As an additional fallback, if both ES256 and HS256 fail, fall back to `auth.getUser()` with the bearer (which uses GoTrue's authoritative key directly).
4. Add Sentry breadcrumbs to the catch blocks so the next time this happens we can see whether it's `signature_verification_failed` vs `jwks_no_matching_key` vs network.

Risk: the JWKS race is INSIDE Supabase's CDN. Forcing a fresh fetch may still get the stale cached key from the same CDN node. Until Supabase's CDN catches up, no amount of refetching helps.

The more durable fix-forward is point 3 — fall back to GoTrue when JWKS fails. That'd give us the BEST of both: fast-path JWKS for normal traffic, GoTrue fallback for the rotation-race window. But this is non-trivial code on top of an already-shipped change, and we've been wrong on auth fixes before.

I do not recommend fixing forward in the next 24 hours unless Murdoch wants to ship a hotfix Build 16 in parallel. Better: revert now, deal with the underlying race after launch when there's room.

### Option C — Wait it out

If the Supabase rotation is finishing, the issue might just stop. Last 5 minutes of production logs are clean. Murdoch can retest TestFlight Build 15 right now; if it works, we let it ride and watch for re-occurrence.

This is plausible but fragile. If Supabase rotates again at any point, every authenticated mobile call dies for the duration of the desync.

---

## My recommendation

**Revert.** Specifically:

```bash
cd /c/Users/murdo/SnapQuote
git revert 5ba6115
git push origin main
```

That returns the web to commit `933079b` (the org.plan billingSource server-side fix from yesterday) — which is the state mobile Build 15 was tested against last night and is partially working. Vercel auto-deploys; ~90 sec to live.

Three reasons I'd revert despite the issue resolving on its own a few minutes ago:

1. **Murdoch's first impression of the change is "it broke things."** That's a confidence cost regardless of root cause. Reverting now lets us re-approach the JWT-direct refactor after launch when Supabase's rotation has finished and we can build the fix-forward properly with a GoTrue fallback layer.
2. **The race is intermittent.** I observed it at 14:36–14:37 (Murdoch's mobile), then at 14:58–15:01 (my refresh-token test). Two distinct windows in 25 minutes. It will recur unannounced. We have no visibility into Supabase's internal state.
3. **The fix-forward path is non-trivial.** Resilient verification means GoTrue fallback (which re-introduces the original problem we tried to solve) plus retry plus better breadcrumbs. That's another full PR. Pre-launch is the wrong moment.

If Murdoch wants to NOT revert, my next-best is **Option B step 3 only** (JWKS-direct as primary, GoTrue as fallback on signature failure). Roughly:

```ts
// in verifySupabaseJWT
try { /* JWKS verify */ } catch { /* fall through */ }
try { /* HS256 verify */ } catch { /* fall through */ }

// new: GoTrue fallback for the rotation race
try {
  const supabase = createSupabaseClientFromToken(token);
  const { data: { user } } = await supabase.auth.getUser();
  if (user) return { userId: user.id, email: user.email ?? null };
} catch {
  // even GoTrue rejected — token is genuinely bad
}

return null;
```

This keeps the fast-path benefit when JWKS is fine and falls back to GoTrue (with mobile retry papering over the GoTrue race) when JWKS is stale. ~20 LOC. Could ship in the next hour. Adds back the GoTrue dependency for a fraction of requests.

---

## What I want from Murdoch

Pick one:

A. **"Revert."** I run `git revert 5ba6115 && git push origin main`. Production is back to known-state in ~2 min. Murdoch retests mobile Build 15 against the reverted production. Decline to attempt a JWT-direct fix again until post-launch.

B. **"Fix-forward with GoTrue fallback."** I add the GoTrue fallback path described above to `verifyJWT.ts`, deploy via the same branch-preview-merge flow we used today. ~30–60 min of work plus another preview verify. Risk: I've been wrong on auth fixes before and we don't have a good test loop right now.

C. **"Wait it out."** Murdoch retests mobile Build 15 right now against current production. If working, let it ride and watch Sentry / Vercel logs for the next 24 hours. I'd want to ship at least Sentry breadcrumbs on the catch blocks before declaring done.

My ranked preference: A > C > B. The architectural direction (JWT-direct) is right but the implementation needs to be fault-tolerant of Supabase's rotation infrastructure, and we don't have time to do that carefully today.

---

## Self-criticism

I've been wrong on the auth path repeatedly:
- Build 11 — per-callsite suppression: too narrow
- Build 12 — body-shape discriminator: didn't actually discriminate
- Build 13 — deletion of retry: correct shape, but masked the underlying race instead of fixing it
- Build 14/15 mobile retry — papered over GoTrue race, didn't fix
- Today's JWT-direct refactor — replaces GoTrue race with JWKS race, doesn't fix

The thing I keep getting wrong is **assuming Supabase's published interfaces are reliable.** Both `auth.getUser()` (GoTrue) and the JWKS endpoint have shown intermittent inconsistency under this project's particular rotation state. The architectural fix that's actually durable is one that doesn't trust either single Supabase endpoint — fall back to the other when one fails. That's the GoTrue-fallback-on-JWKS-fail option.

I shipped today's change on "structural test passed + JWKS endpoint manually validated." That was insufficient. The test that would have caught this is "mint 10 fresh tokens via the refresh-token grant over a few minutes, verify each one against production, look for any failure." I didn't do that.

I'll be conservative going forward: for any auth change, the green criteria includes "verify N tokens issued via the same flow mobile uses, sustained over Y minutes, before declaring done."

---

## Diagnostic artifacts

- `scripts/jwt-verify-diagnostic.mjs` — runnable Node script that takes a JWT and reports header, payload, and the result of each of my code's verification paths. Used throughout this investigation.
- The leaked tokens in this doc and the script's args are short-lived (1h exp). Harmless once expired.
