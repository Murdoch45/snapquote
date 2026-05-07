# Breadcrumbs vs Charles Proxy — opinion

**Date:** 2026-05-07
**Author:** Claude Code
**Mode:** Read-only opinion + technical confirmation. No code, no commits, no deploys.

---

## TL;DR — yes, do the breadcrumb approach

The breadcrumb approach is **better than Charles Proxy for our specific bug, with two caveats:**

1. **Breadcrumbs alone don't reach Sentry.** Breadcrumbs are buffered in the request scope and only transmitted when an event is captured. Since `requireMemberForApi` returns `NextResponse.json` with a 401 (it does NOT throw), no event is captured by default, and the breadcrumbs are silently dropped at request end. **We must explicitly call `Sentry.captureMessage(...)` at the 401 return point** so the breadcrumbs flush. We must also call `await Sentry.flush(2000)` before returning the response in serverless to ensure transmission before the lambda freezes.

2. **Breadcrumbs see what the SERVER does, not what mobile SENT.** If the bug is in mobile's bytes (corrupted Authorization header, dual headers, weird encoding), server-side breadcrumbs at the verify path won't see it because they only run AFTER the bearer is extracted. We can partially compensate by ALSO logging the redacted Authorization header value at the entry point — that gives us mobile-byte visibility.

With those two caveats handled, this approach beats Charles Proxy for diagnosing OUR specific bug.

---

## Q1 — Is this approach actually better than Charles Proxy?

**Yes.** Reasoning by what each approach answers:

| Question | Charles Proxy | Sentry breadcrumbs |
|---|---|---|
| What bytes is mobile sending? | ✅ Direct answer | ⚠️ Partial — only what server received |
| Why is server returning 401? | ❌ Need to recreate locally | ✅ Direct answer (which path failed, what error) |
| What's the JWKS state at moment of failure? | ❌ Cannot capture | ✅ Direct answer (log JWKS hash on each `getJwks()`) |
| What's the bearer's `kid`/`iss`/`aud` claim? | ✅ Direct (decode the captured) | ✅ Direct (log decoded header/payload claims) |
| Setup friction | High (proxy install, cert install on iPhone, route configuration) | Low (push code, wait 90s, Murdoch retests) |
| Reusable for next bug | No (one-time capture) | Yes (instrumentation stays) |
| Captures across multiple failures | No (manual per-capture) | Yes (every request after deploy) |
| Risk of bearer leak | High (raw bearer in Charles UI) | Low (we control redaction) |
| Risk of failed setup | Real (Charles + iOS root cert dance can fail) | Low (deploy is straightforward) |

For our bug specifically — "WHY is the server rejecting Murdoch's bearer?" — breadcrumbs answer the question more directly. Charles tells us "what was sent" but we'd then need to manually feed that bearer through the verify path locally, which is just a slower version of what server-side breadcrumbs do automatically.

The **only** advantage of Charles is if the bug is truly in mobile's bytes (header malformed, etc.). That's possible but my prior reading of mobile's `lib/api/http.ts` shows the Authorization header construction is straightforward `\`Bearer ${options.accessToken}\``. There's no string mangling. The risk that mobile is sending corrupted bytes is low — but to cover it, we add one line of breadcrumb that records the received Authorization header (redacted to fingerprint).

**Net: breadcrumbs + entry-point redacted-bearer log = Charles-equivalent visibility + the actual diagnostic data we need. Lower setup cost, more diagnostic info, reusable.**

---

## Q2 — What's the risk

Concrete risks, ordered by likelihood × impact:

### High-impact risks (must mitigate)

1. **Logging the actual bearer to Sentry would be a security leak.** Bearers are 1-hour-lifetime credentials. If logged in a Sentry breadcrumb, anyone with Sentry access could replay them.
   - **Mitigation:** Log only a fingerprint — first 8 chars + `...` + last 8 chars + `(len=N)`. Never the middle, never the signature. Use the same redaction pattern Sentry SDK uses for known credentials.

2. **Logging payload claims may include PII.** The Supabase JWT payload includes `email`, `user_metadata` (which can have full_name, picture URL, etc.). Anything in `user_metadata` is user-controlled.
   - **Mitigation:** Log only a controlled allowlist of claims — `kid`, `iss`, `aud`, `exp`, `iat`, length-of-`sub` (don't log the actual UUID, just confirm it's present). NEVER log `email`, `user_metadata`, or full payload. Specific NACL: `JSON.stringify(payload)` is forbidden.

3. **Captured `Sentry.captureMessage` events may flood Sentry.** Murdoch is the only user, but if I tag indiscriminately or fire on every 401 forever, we'd burn Sentry quota.
   - **Mitigation:** Treat this as a TIME-BOUNDED diagnostic. Add the instrumentation, capture data for 1–2 hours, then revert the captureMessage path (keep only the breadcrumbs for future events). Or sample to e.g. 1-in-10 once we have data.

### Medium-impact risks

4. **Sentry SDK might not be initialized at the moment the captureMessage fires.** Vercel cold-starts may invoke the function before Sentry's instrumentation is fully ready. Result: the first 1–2 requests after a fresh lambda spin-up won't capture.
   - **Mitigation:** Murdoch hits the failing action multiple times (5+ requests) so we cover both warm and cold invocations.

5. **`Sentry.flush(2000)` adds 0–2s latency to every 401 response.** In a serverless function, the lambda freezes after the response. If we don't flush, the captureMessage may not transmit before freeze. Adding flush ensures transmission but adds a small per-request latency cost.
   - **Mitigation:** This is fine for a diagnostic. 2s on 401s the user already saw as failures is invisible. Once we have data, remove the flush + captureMessage. Keep only breadcrumbs.

6. **Breadcrumb cardinality / Sentry tag misuse.** If I tag `bearer_fingerprint` as a Sentry tag, every unique bearer becomes a unique tag value. Sentry's tag indexing has cardinality limits.
   - **Mitigation:** Put bearer fingerprint in `extra` or `contexts`, NOT tags. Reserve tags for low-cardinality fields (alg, error_code, route, env).

### Low-impact risks (worth mentioning)

7. **Adding code to a deployed file is itself a code change with deploy risk.** Yesterday taught me this.
   - **Mitigation:** Preview deploy first, multi-token verify (mint 5+ fresh tokens, hit preview, all 200), confirm no behavior change before merging. Same discipline as a real fix.

8. **Sentry SDK in @sentry/nextjs auto-captures spans for transactions.** The 401 transaction WILL appear as a span in Sentry (we already saw the 200 case shows up). The breadcrumbs will be attached to those spans automatically. So even without `captureMessage`, the data MIGHT be there.
   - **Caveat:** earlier I searched Sentry for `http.status_code:401` and `transaction:"POST /api/app/leads/unlock"` — both returned 0 results. So either Sentry's tracing isn't sampling failed transactions, or the span data isn't being indexed for the queries I tried. **Cannot rely on auto-capture; must explicitly captureMessage.**

9. **Breadcrumb ordering / scope leakage between concurrent requests.** Sentry uses AsyncLocalStorage to scope breadcrumbs to the current request. In Next.js 15 + @sentry/nextjs, this works correctly — verified by community usage. Risk is low.

10. **My deployed `verifyJWT.ts` has silent `try { ... } catch {}` blocks.** Adding breadcrumbs in the `catch (e)` parameter (currently caught with no parameter) is the additive change. If the catch parameter syntax has any subtle issue (TypeScript strict catch param types in Next.js's tsconfig), the build could fail. Easy to test locally.
    - **Mitigation:** Run `npm run typecheck` before push.

---

## Q3 — Technical mechanism: when do breadcrumbs fire

**Confirmed via Sentry docs:** breadcrumbs are buffered until an event is captured. They don't reach Sentry by themselves. From the [Sentry docs](https://docs.sentry.io/platforms/javascript/guides/nextjs/capturing-errors/):

> Breadcrumbs are buffered until the next event is sent and will not create an event in Sentry by themselves.

For our specific case:

- `requireMemberForApi` returns `NextResponse.json({error: "Unauthorized"}, {status: 401})` — this is a **return**, not a **throw**.
- The Next.js route handler completes normally (no thrown exception).
- Sentry's `@sentry/nextjs` instrumentation does NOT auto-capture non-thrown 401s as issues.
- Sentry's tracing does record the HTTP transaction as a span, but my earlier query for `http.status_code:401` in spans returned zero results — either sampling drops failed transactions, or the field isn't indexed for our project. **Cannot rely on auto-capture.**

**To make breadcrumbs reach Sentry, we MUST:**

1. **Call `Sentry.captureMessage(...)` at the 401 return point.** This generates a message event, which is sent to Sentry along with all breadcrumbs accumulated during the request scope.
2. **`await Sentry.flush(2000)` before `return NextResponse.json(...)`** in serverless environments. Vercel functions freeze after returning the response; without flush, the captureMessage may not transmit. 2-second timeout is the typical recommendation. Confirmed by [Sentry's serverless docs guidance](https://docs.sentry.io/platforms/javascript/guides/nextjs/usage/) (referenced in search results).

Concretely:
```ts
// At the 401 return path:
Sentry.captureMessage("auth.requireMember 401", {
  level: "warning",
  tags: { /* low-cardinality */ },
  extra: { /* high-cardinality, including redacted fingerprint */ }
});
await Sentry.flush(2000); // Critical for serverless
return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
```

Without those two lines, the breadcrumbs go nowhere.

---

## Q4 — Is the code structured cleanly for ~30 LOC additive?

**Yes.** Looked at the deployed `verifyJWT.ts` (108 LOC) and `requireRole.ts` (191 LOC). The structure is clean:

`verifyJWT.ts`:
- `verifySupabaseJWT()` has two distinct try/catch blocks (ES256, then HS256). Both catches have no parameter (silent swallow). I'd add `(e)` to each, and inside each catch, one `Sentry.addBreadcrumb` with the jose error code/message.
- At the top of the function (after the `if (!token)` guard), I'd add one breadcrumb logging the bearer fingerprint and decoded header (just `kid` and `alg`, via `decodeProtectedHeader`).
- Optional: add one breadcrumb after `extractClaims()` succeeds (info-level "verify success") — useful for cardinality (success vs failure ratio).
- `getJwks()` could log a hash of the cached JWKS the first time it's instantiated. Optional but cheap.

Total in `verifyJWT.ts`: ~12-15 lines added. No restructure.

`requireRole.ts`:
- `resolveIdentity()` returns null for both bearer-failure and cookie-failure cases. I'd add one breadcrumb at each return-null point ("bearer path failed: verify returned null", "cookie path failed: getUser returned null").
- `requireMemberForApi()` and `requireOwnerForApi()` each have a 401 return point at the top (`if (!identity) return ...`). At that point, add `Sentry.captureMessage(...)` + `await Sentry.flush(2000)` before the return.
- Both helpers also have 403 returns ("Membership missing", "Owner role required", "Demo org") — those are different bugs, leave them alone for now.

Total in `requireRole.ts`: ~10-15 lines added across the two helpers. No restructure.

**Imports:** add `import * as Sentry from "@sentry/nextjs"` to both files (already used elsewhere in the codebase, confirmed via web Sentry events earlier).

**Total: ~25-30 LOC added across 2 files. Pure additive. No behavior change. Easy to revert.**

---

## Q5 — Implementation walkthrough

Concretely, here's what I'd add (NOT writing code yet, just showing shape):

### `lib/auth/verifyJWT.ts` (additive)

1. Import Sentry at the top.
2. Add a helper `redactBearer(token: string): string` that returns `${first8}...${last8} (len=${total})`.
3. Add a helper `safeDecodeHeader(token)` that uses `jose.decodeProtectedHeader` defensively — wraps in try/catch, returns `{ alg, kid, typ }` or null.
4. In `verifySupabaseJWT()`, top of function:
   ```
   Sentry.addBreadcrumb({
     category: "auth.verifyJWT",
     level: "info",
     message: "verify start",
     data: { bearer: redactBearer(token), header: safeDecodeHeader(token) }
   });
   ```
5. In ES256 catch:
   ```
   } catch (e) {
     Sentry.addBreadcrumb({
       category: "auth.verifyJWT",
       level: "warning",
       message: "ES256 path failed",
       data: { code: e?.code, name: e?.name, msg: e?.message?.slice(0, 200) }
     });
   }
   ```
6. After ES256 success (just before the early return):
   ```
   Sentry.addBreadcrumb({
     category: "auth.verifyJWT",
     level: "info",
     message: "ES256 verified",
     data: { aud: payload.aud, iss: payload.iss, exp: payload.exp }
   });
   ```
   (NOTE: not logging `sub`, not logging `email`, not logging `user_metadata`.)
7. Same pattern in HS256 catch and HS256 success.
8. Final return null:
   ```
   Sentry.addBreadcrumb({
     category: "auth.verifyJWT",
     level: "warning",
     message: "verify returned null — both paths exhausted"
   });
   return null;
   ```

### `lib/auth/requireRole.ts` (additive)

1. Import Sentry at the top.
2. In `requireMemberForApi()` and `requireOwnerForApi()`, at the `if (!identity)` 401 return:
   ```ts
   if (!identity) {
     Sentry.captureMessage("auth.requireMember 401", {
       level: "warning",
       tags: { route: <route or "unknown">, has_bearer: getBearerToken(request) ? "yes" : "no" },
       extra: {
         bearer_fingerprint: getBearerToken(request) ? redactBearer(getBearerToken(request)!) : null,
         header: getBearerToken(request) ? safeDecodeHeader(getBearerToken(request)!) : null
       }
     });
     await Sentry.flush(2000);
     return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
   }
   ```
3. Same for `requireOwnerForApi()`.

### Pre-merge checklist (yesterday's lesson)

1. `npm run typecheck` — must be clean
2. Push to a feature branch (NOT main)
3. Vercel auto-creates preview deployment
4. Mint 5–10 fresh tokens via mixed flows over 5 min, hit preview, all 200
5. Verify the breadcrumbs reach Sentry on a no-bearer test (hit `/api/app/team/members` with no Authorization → 401, then check Sentry for the captureMessage event with breadcrumbs attached)
6. Verify Sentry search for `auth.requireMember 401` returns the test event with full breadcrumbs visible
7. Only after preview is verifiably emitting breadcrumbs to Sentry, merge to main

That's the discipline I lacked yesterday.

### Time estimate

- Implementation: 25–30 min
- Preview deploy + verification: 15–20 min
- Murdoch retests on Build 15 (no new mobile build needed): 5 min
- Sentry data analysis: 15 min
- Decision (focused fix or revert): 15 min

**Total to data: ~1.5h.**
**Total to deployed-or-reverted: depends on Phase 4 outcome, +1–2h if focused fix, +30 min if revert.**

Compare to Charles Proxy plan: ~1h to data if everything works, indeterminate if Charles setup fails. Breadcrumb plan has more controlled timeline.

---

## Things to verify after merge (actual data we'll see in Sentry)

When Murdoch hits the failing action, we should see in Sentry one event per request with breadcrumbs ordered chronologically:

```
[breadcrumb] auth.verifyJWT: verify start (bearer=eyJhbG..._VOGobhqLA, header={alg:ES256, kid:8554...})
[breadcrumb] auth.verifyJWT: ES256 path failed (code:ERR_JWS_SIGNATURE_VERIFICATION_FAILED, name:JWSSignatureVerificationFailed)
[breadcrumb] auth.verifyJWT: HS256 path failed (code:ERR_JWS_SIGNATURE_VERIFICATION_FAILED, name:JWSSignatureVerificationFailed)
[breadcrumb] auth.verifyJWT: verify returned null
[event] auth.requireMember 401 (warning) tags={route:leads/unlock, has_bearer:yes} extra={bearer_fingerprint, header}
```

That tells us exactly which path failed and why. From there:

- If `header.kid` is in JWKS but ES256 verify fails → confirmed JWKS rotation race / Supabase signing inconsistency
- If `header.kid` is NOT in published JWKS → confirms Supabase issued a token signed with a key not (yet) published
- If `header.alg` is something unexpected (like `none` or `RS256`) → mobile is sending a different format
- If bearer fingerprint differs from what mobile would normally send → corruption between mobile and server

We get DEFINITIVE diagnostic data. Not theory.

---

## Why I'd actually pick this over Charles Proxy

Honestly: Charles works. It captures the bearer, we decode, we test. But:

1. Murdoch is tired. Setup friction matters. Breadcrumbs add zero friction on his side after deploy.
2. The diagnostic question we're trying to answer ("why is the server rejecting?") is more directly answered by server-side instrumentation than by mobile-side capture.
3. The instrumentation has lasting value. Once added (at least the breadcrumbs, even if we remove the captureMessage post-diagnostic), the next auth bug is visible in Sentry without any new tooling.
4. The risk of "Charles setup fails on Murdoch's machine and we waste an hour" is real. The risk of "code-deploy fails" is bounded by Vercel's instant-rollback.
5. We learn more per minute spent. Charles tells us one bearer at one moment. Breadcrumbs tell us the verify path's full state across every request.

**The only world where Charles is materially better:** if the bug is mobile-bytes-corruption (e.g., mobile is somehow sending `Bearer  X.Y.Z` with a doubled space, or `Authorization: Bearer X.Y.Z\nbroken`). My code's `getBearerToken` regex `^Bearer\s+(.+)$` handles single or multiple whitespace, so that's already robust. Doubled headers would manifest as `request.headers.get("authorization")` returning the first or last value depending on Node's behavior — Node's `headers.get` returns a comma-joined string for multi-value headers, which my regex would then mis-handle. We can detect that by also logging `request.headers.get("authorization")?.length` in the breadcrumb. ~2 LOC.

So even the mobile-bytes case can be partially diagnosed via breadcrumbs.

---

## Recommendation

**Do the breadcrumb approach.** Specifically:

1. Branch from main, make the additive changes per the walkthrough above.
2. `npm run typecheck` clean.
3. Push to feature branch, Vercel preview deploys.
4. Verify on preview: hit `/api/app/team/members` with bogus bearer → see captureMessage event in Sentry with breadcrumbs attached. Confirms instrumentation works.
5. Multi-token verify on preview: 5+ fresh-grant tokens, all 200, no spurious 401s.
6. Merge to main, Vercel deploys to production.
7. Tell Murdoch to hit the failing action 5+ times.
8. Pull Sentry events for `auth.requireMember 401` over the test window.
9. Diagnose from data.

If you say go, I do it. ~1.5h to the diagnostic data. Plus the discipline upgrade: this is the first auth deploy this week with proper observability. That's progress regardless of what we find.

If you don't want to relax the no-code-changes constraint: Charles Proxy is the fallback. It works, just with more setup friction.

**Either way**, the order of operations stays the same as my prior meta-strategy doc: **capture data → diagnose from data → THEN decide on a fix.** Not "ship the next plausible theory and hope."

---

## What I'm not doing

- Not writing the code yet. You asked for opinion + technical confirmation only.
- Not pretending breadcrumbs are zero-risk. The redaction discipline is critical.
- Not abstaining. My recommendation is concrete: yes, do this approach, in the form described above.
- Not pretending this'll definitely work. If breadcrumbs reveal "the bearer is fine, the verify works" — then the bug is somewhere else and we'll need yet another diagnostic. The plan accommodates that.

---

## Sources

- [Sentry @sentry/nextjs Capturing Errors docs](https://docs.sentry.io/platforms/javascript/guides/nextjs/capturing-errors/) — confirms breadcrumbs require an event to be sent
- [Sentry @sentry/nextjs Usage docs](https://docs.sentry.io/platforms/javascript/guides/nextjs/usage/) — mentions `Sentry.flush()` recommended in serverless after `captureException`
- Direct read of `lib/auth/verifyJWT.ts` (108 LOC) and `lib/auth/requireRole.ts` (191 LOC) on commit `5ba6115`
- Earlier Sentry MCP search at `http.status_code:401` and `transaction:"POST /api/app/leads/unlock"` returning zero results — confirms 401s aren't auto-captured as spans/issues for our project at current sampling

Sources:
- [Capturing Errors | Sentry for Next.js](https://docs.sentry.io/platforms/javascript/guides/nextjs/capturing-errors/)
- [Capturing Errors and Events | Sentry for Next.js](https://docs.sentry.io/platforms/javascript/guides/nextjs/usage/)
- [Add Sentry to Vercel Next.js API Routes](https://dev.to/aryanjnyc/add-sentry-to-vercel-next-js-api-routes-85o)
