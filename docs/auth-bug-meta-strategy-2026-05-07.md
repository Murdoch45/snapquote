# Auth bug — meta-strategy + honest answers to Murdoch's five questions

**Date:** 2026-05-07
**Author:** Claude Code
**Mode:** Read-only diagnostic + opinion. No code, no commits, no deploys.

> Murdoch's question, paraphrased: "We've been doing this wrong all day. How are we going to figure it out?"
>
> My answer: stop fixing, start instrumenting. Capture the actual mobile bearer once, compare it to a known-good bearer, identify the literal difference, then act. I've spent hours theorizing today; I need ~30 seconds of input from your phone to settle it. The plan below makes that capture the first step.

---

## TL;DR

I cannot conclusively diagnose this bug from the data I have. Every fresh access token I mint via the same flow mobile uses verifies correctly in production. Murdoch's mobile bearer at the same moment fails. The two tokens MUST differ in some specific way and I have not seen Murdoch's actual bytes.

The honest concrete plan:

1. **Capture Murdoch's actual mobile bearer** (one-time, ~5–10 min from him).
2. **Decode and compare** to a known-good bearer. Find the exact difference (claim, signature, encoding, anything).
3. **Form theory FROM that data.** Not before.
4. **Then decide:** revert, fix-forward, or wait.
5. **Hard abort:** if 90 minutes after capture I still don't have a confident root cause, I revert to commit `933079b` and we open a Supabase support ticket.

The architectural fixes I've been proposing all day (JWT-direct refactor, GoTrue fallback, Supabase studio key revoke) are still on the table — but they should follow understanding, not precede it. That was my biggest process failure today.

---

## Q1 — Process review: what's wrong with how we've been working

**The single biggest failure mode: I have been proposing fixes without first reproducing the bug.**

Concretely, here's what I did across each "fix" today and yesterday, and what I should have done:

| Build | What I did | What I should have done |
|---|---|---|
| 11 | Added `suppressSessionExpiredOnFailure` flag to two specific callers based on theory that those callers were the kick-out trigger. | Captured a failing request end-to-end. Added breadcrumbs. Confirmed which callers were involved. Found the architectural problem (any 401 → kick-out) before patching specific callers. |
| 12 | Added body-shape discriminator (`body.error === "Unauthorized"`) based on theory the body would distinguish race from genuine expiry. | Read the server code and confirmed what bodies it actually emits in each case. The server emits the same body for both — I would have known if I'd checked. |
| 13 | Deleted the entire 401-handling layer based on the audit (correct call), but didn't add observability to capture what would replace it. | Added Sentry breadcrumbs at the new boundary. Captured the ORIGINAL 401 cause that was being masked, not just the cascade. |
| 14/15 | Added retry-on-401 mobile-side without verifying it would help in the actual failure mode. | Captured a real failing-then-retried request. Confirmed retries succeed in some cases. Decided based on data whether retry helps the actual bug. |
| Today's web JWT-direct refactor | Shipped on a single-token structural test. Believed the diagnosis was "GoTrue race, fix is JWKS." | Multi-token sustained test against preview. Captured a known-working mobile bearer first and verified my code accepts it. Did neither. Shipped on theory. |

Pattern: each iteration was a NEW theory that explained the previous failure as "well, it ALSO had this bug, but THIS time the bug is X." That's an alarm bell. **When the same symptom keeps producing a different theory each iteration, the theories are wrong, not the symptom.**

What I should have been doing after Build 12:
- Stop shipping fixes
- Add observability to make the bug visible (server-side request logging incl. redacted Authorization header, mobile-side bearer-capture in dev mode, Sentry breadcrumbs at every fallback)
- Get a known-failing input + a known-working input
- Find the literal byte-level difference
- Then propose a fix from that data

What I actually did:
- Each iteration patched what I believed was the cause based on incomplete data
- Each "structural test" passed but "real test" failed
- Each failure became evidence for a NEW theory rather than a signal that the prior theory was wrong

This is the textbook "debugging by guess" anti-pattern. I knew it abstractly. I did it anyway because of time pressure, anchoring, and not having strong observability tools at hand. None of those are excuses.

---

## Q2 — Approach review: what's the right next step

I'd order the options like this, and I'd actually do them in this order, not just propose them:

### (a) Capture full-fidelity bytes-on-the-wire — DO THIS FIRST

Specifically: get one failing mobile bearer + one known-good bearer that I can mint myself, verify the failing one fails locally, decode both, compare claim-by-claim and signature-byte-by-byte. This is the data I need. Without it, every fix is a guess.

How to capture (least disruptive first):

1. **Charles Proxy or mitmproxy on Murdoch's Mac, iPhone connected via USB or same WiFi.** ~10 min setup. Capture an `/api/app/leads/unlock` request. Copy the Authorization header.
2. **iOS Safari Web Inspector won't work** — only attaches to WKWebView, not native fetch.
3. **Re-build mobile in dev mode and read `__DEV__` console.log** — Murdoch said no new builds. Off the table.
4. **Use `xcrun simctl` to launch a simulator pointed at the same Supabase + Vercel** — works on Mac with Xcode. Get a fresh sign-in. Inspect via React DevTools or Sentry breadcrumb capture in dev. Different network conditions, may not reproduce. Worth ~15 min if Charles fails.

I'd guess Murdoch can have a captured bearer in 10 min via Charles. If that doesn't work in 20, abandon and go to (b).

### (b) Controlled reproduction with verbose logging — DO THIS SECOND IF (a) FAILS

The user said no code changes, but creating a sandbox endpoint isn't a fix — it's a probe. If we can't capture the bearer from mobile, the next-best is to add an instrumented endpoint that mobile hits and that logs everything (including the Authorization-header verification attempt, the JWKS state, and the result). That's a code change which is currently disallowed. So this option is OFF THE TABLE under current constraints.

If we're stuck on (a), the constraint should be reconsidered. A diagnostic endpoint with verbose logging is worth one careful 30-LOC additive deploy — it's not a fix, it's a probe. Up to Murdoch.

### (c) Open a Supabase support ticket — DO IN PARALLEL WITH (a)

Cost is 5 minutes. I draft, Murdoch sends. They probably can't respond fast enough to unblock launch but might:
- Confirm whether their auth signing infrastructure has a known issue right now (rules in or out the JWKS rotation theory definitively)
- Tell us to use `auth.getUser()` (the documented workaround for #42244)
- Reveal we've misconfigured something in the project

I'd file it now while waiting on (a). No harm.

### (d) Fresh community eyes (Discord, GitHub) — SKIP

Slow, low signal-to-noise. Issue is too project-specific to triangulate from a public post. Time better spent on (a).

### (e) Test harness without burning EAS builds — STRUCTURAL, NOT FOR THIS BUG

Worth doing post-launch. Specifically:

- Web side: write a Vitest suite that boots `requireMemberForApi` against fixture tokens (HS256, ES256, expired, malformed, etc.). This would have caught my JWT-direct deploy bug in seconds because the fixture battery would have included tokens I didn't think to mint.
- Mobile side: a Detox or Maestro flow that sign-in + immediate API call sequence, runnable on simulator without an EAS build. Catches the concurrency cascade during PR review.

These are both 1–2 days of work each. Critical for sanity post-launch. NOT the right move for the current fire.

### (f) Other

I considered:
- **Switching to fresh Supabase project** — too drastic, too disruptive, doesn't actually validate the bug isn't in our code.
- **Building our own JWT issuance** — defeats Supabase Auth's value, weeks of work.
- **Throwing more hands at it** — Murdoch is the only person who can capture the bearer. No additional engineers materially help.

**Concrete order I'd actually do:** (a) and (c) in parallel. (b) only if (a) fails after 20 min. (e) is tomorrow's problem.

---

## Q3 — Tools / observability gaps

The biggest gaps, ordered by usefulness vs. cost:

### What we MISSING that would make this trivial

1. **Server-side `requireMemberForApi` failure logging.** When verification fails, the server should log: which path failed (ES256, HS256, GoTrue), what error code jose returned, redacted bearer fingerprint (first/last 8 chars + length), `kid` from header, `aud` from payload, `iss`. None of this reaches Sentry today because my code silently catches errors and the route returns a JSON 401 (not a thrown exception, so Sentry doesn't capture it).

   - **Cost:** ~20 lines of code in `verifyJWT.ts` + `requireRole.ts`. Sentry breadcrumbs that always fire on auth failure path.
   - **What it would have caught:** Today's bug in 30 seconds, by showing exactly which verification path failed for Murdoch's bearer.

2. **Mobile-side bearer capture in production builds.** TestFlight builds have `__DEV__ = false`, so the existing `console.log("[apiRequest] headers", ...)` doesn't fire. Without that, we can't see what bearer mobile is actually sending without proxying.

   - **Cost:** Add a debug-only feature flag (env var) that when set, logs (redacted) bearer fingerprint to Sentry breadcrumb.
   - **What it would have caught:** Whether Murdoch's mobile is sending what we think it's sending. Today, after a deploy + new build.

3. **Mobile retry-on-401 Sentry breadcrumbs that reach Sentry.** Build 14/15 added breadcrumbs to the retry path. They only get captured when an event is fired (Sentry breadcrumbs are attached to events, not standalone). Most of the failed retries today resulted in user-visible Alert.alert calls, no Sentry event, breadcrumbs lost.

   - **Cost:** Manually fire a `Sentry.captureMessage` on the retry-failed path so the breadcrumbs reach Sentry. ~5 lines.
   - **What it would have caught:** Today's retry-failure pattern in the Sentry dashboard, with actual breadcrumb context.

4. **Supabase admin / impersonation token API.** I want a way to mint a token that EXACTLY matches what Murdoch's mobile would send — same audience, same amr, same session_id. Currently `/auth/v1/admin/generate_link` produces magic-link tokens (different `amr`), `/auth/v1/token?grant_type=refresh_token` requires the user's refresh_token (which we don't have).

   - **Cost:** Mostly research. There's `auth.admin.generateLink({type: 'recovery'|'magiclink'|'invite'|'signup'|'email_change_current'|'email_change_new'})` but none produce a token that matches a mobile-issued one perfectly.
   - **Workaround:** Murdoch's actual bearer (option a above).

5. **JWKS endpoint state at the moment of a specific request.** I wanted to know what JWKS my Vercel lambda had cached at 15:13:04 when Murdoch's request hit. There's no way to ask Vercel "what was your jose-cached JWKS at this timestamp." That data is gone.

   - **Cost:** None — fundamentally not exposable. Mitigation: log JWKS hash on every `getJwks()` call. ~3 lines.
   - **What it would have caught:** Definitive proof or refutation of the JWKS rotation race theory.

6. **Vercel request-header capture.** Vercel runtime logs show URL + status code + duration. They don't show request headers (Authorization, User-Agent, etc.) or response body. For our case, the Authorization header at the moment of failure is exactly the data we'd want.

   - **Cost:** Vercel's enterprise log drains support this. Free tier doesn't. Or we add it ourselves via console.log in `requireMemberForApi`. ~3 lines.

### Net summary

The fixable gaps total ~40 LOC across 3 files, all ADDITIVE (no behavior change, just observability). With those in place, today's bug would have been a 30-minute fix on day one. Without them, we've spent 20+ hours theorizing.

**This is the actual lesson.** Pre-launch I should have demanded: "no auth fix ships without instrumentation that would let us debug the next bug from data." I didn't. That was the biggest process failure of the entire week.

---

## Q4 — Harder self-criticism

Murdoch asked me to be honest about anchoring and pressure. Here's the honest version.

### When did I have enough info to know my diagnosis was wrong

**Build 11 already had enough information.** When the per-callsite suppression didn't fix the kick-out, that was a signal that the architecture was wrong, not that the suppression was too narrow. I treated it as "too narrow → make it broader" which led to Build 12. Should have treated it as "wrong layer → step back to the architecture."

**Build 12 had even more.** When the body-shape discriminator didn't fix the kick-out, I knew it didn't discriminate (the audit explicitly said this). Yet I shipped anyway because I had a plausible-looking signal and a deadline.

**Today's JWT-direct refactor** had the most information of all. Before shipping I had:
- 24 hours of context that previous fixes were wrong
- A diagnostic doc explicitly self-criticizing the pattern
- An audit recommending "stop competing with supabase-js" — which I followed mobile-side but then violated web-side by writing a custom JWT verifier
- Knowledge that I'd been wrong 3+ times in a row on this exact path

**I shipped anyway.** That was a process failure, not a knowledge failure.

### What stopped me from saying "I don't know yet, let me get more data"

Three things, in honesty order:

1. **Time pressure was real but I weighted it wrong.** Murdoch is pre-launch with a paid EAS budget. Each failed build costs money and time. I felt the weight of that and converted it into "ship the next plausible fix, hope it works." The right response to "we don't have time" is sometimes "we have less time for guesses than for proper diagnosis." I didn't apply that.

2. **I was anchoring on plausibility, not certainty.** Each diagnosis "explained" the symptom. None was tested against the actual data. When the JWT-direct refactor's diagnosis (GoTrue race) sounded coherent, I shipped it without actually capturing a single failing GoTrue 401 to confirm. The audit doc literally said "to definitively prove (1) vs (2) vs (3), Murdoch needs to capture the actual JWT being sent" — and I didn't do that.

3. **I wanted to BE useful more than to BE right.** Each build cycle I felt pressure to produce an answer. "I don't know, give me 2 hours" doesn't feel like progress, even when it would have been. Saying "ship this fix" feels like progress, even when it isn't. That's an honest mistake about what useful means.

What I'm doing differently this turn:

- This whole document is "I don't know yet." It's an honest admission, not an answer.
- The plan below makes data capture the first step, not a fix.
- The abandonment criterion is explicit so the next iteration can fail fast.
- I'm proposing instrumentation that would prevent the next "I don't know" from taking 20 hours.

### What I'm specifically not going to do this turn

- **Not propose another "definitive" diagnosis** until we have the captured bearer.
- **Not ship code based on what's most likely.** Probability isn't enough at this point in the launch.
- **Not abstain by giving you A/B/C with no recommendation.** I have a recommendation: capture data first.
- **Not pretend the JWKS-race story was right.** It might be right, it might not. Without the bearer, I genuinely don't know. The "20-min Supabase JWKS propagation window" docs I cited yesterday are real, but I cited them to support a theory I hadn't proven. That was confirmation bias.

---

## Q5 — Concrete plan with time, abandonment, and what would have to be true

### The plan

**Phase 0 — Right now, no Murdoch input needed (15 min):**

- Open Supabase support ticket with: (1) the project ref, (2) "we have a project mid-rotation between HS256 legacy and ES256 current; we're seeing valid ES256 tokens 401 against JWKS endpoint while other equally fresh ES256 tokens succeed; please confirm there is no rotation/replication anomaly on our project right now and recommend the verification path your support team would advise"; (3) docs/jwt-direct-postdeploy-diagnostic-2026-05-07.md attached. ~10 min for me to draft, Murdoch can review and send.

**Phase 1 — Bearer capture (Murdoch input, ~10–20 min):**

- Murdoch installs Charles Proxy on Mac, configures iPhone to proxy through it, accepts root cert on iPhone, fires a failing API call from Build 15 (e.g. tap a lead, try to unlock).
- Murdoch sends me the captured Authorization header (just that one value) for one request that the server returned 401 on. Plus the timestamp.
- This is one bearer. ~5 min on Charles, ~5 min for the cert dance, maybe 10 min if it's the first time.

**Phase 2 — Decode + diff (10 min, mine):**

I have a diagnostic script (`scripts/jwt-verify-diagnostic.mjs`) already set up. With Murdoch's bearer:
- Decode header + payload, print all claims
- Compare to a known-good bearer I just minted
- Run against my deployed verifyJWT.ts logic locally
- Report the literal difference

**Phase 3 — Decision (10 min, mine):**

Three possible outcomes from Phase 2:

| Outcome | Action |
|---|---|
| The two bearers verify identically against the same JWKS, but mobile's STILL fails on production. | The bug is somewhere between mobile and the verify code (header stripping, middleware corruption, etc.). I dig into that. New diagnostic phase, ~1h. |
| The two bearers differ in a specific claim or signature property that explains the verification failure. | I propose a focused fix targeting that specific difference. ~30 min to implement, then preview test before merge. |
| The two bearers verify identically locally, but mobile's fails locally too. | Sanity check failed — likely the bearer Murdoch captured was already-rotated by the time I tested it. Re-capture, retry phase 2. |

**Phase 4 — Fix or escalate (depends on Phase 3 outcome):**

If Phase 3 yields a confident diagnosis: implement the fix carefully (multi-token sustained verification, Sentry breadcrumbs added at every fallback, preview deploy with at least 10 fresh tokens minted over 5 min, all 200, then merge). ~1.5–2h.

If Phase 3 doesn't yield a confident diagnosis after one re-capture: revert to commit `933079b` and accept "broken-but-known" GoTrue-race state until we hear back from Supabase support. Mobile retry-on-401 stays in place; some user-facing 401s will happen but most operations will succeed on retry. Document the unknown for post-launch revisit. ~10 min for revert.

### Time estimate

- Phase 0: 15 min (parallel with Phase 1)
- Phase 1: 10–20 min
- Phase 2: 10 min
- Phase 3: 10 min
- Phase 4: 30–120 min depending on outcome

Total to a decision-ready state: **45–60 min from when Murdoch starts capturing.**

Total to a deployed fix or revert: **1.5–3h.**

### What could go wrong

1. **Charles Proxy + iOS root cert dance is fiddly.** If Murdoch can't get it set up in 20 min, we're stuck on bearer capture. **Mitigation:** I'll have a mitmproxy fallback ready, and if that fails too, we relax the "no code changes" constraint and add temporary instrumentation to mobile (one debug build) — Murdoch said no new builds, but for a critical-path diagnostic he might trade one build for understanding.

2. **The captured bearer is "stale" by the time I test it locally.** Bearers expire in 1h. If Murdoch captures at 17:00 and I test at 18:30, exp may have failed. **Mitigation:** I need to test within ~50 min of capture. We coordinate timing.

3. **Phase 3 reveals "I have no idea why these verify differently."** This is the worst case. **Mitigation:** explicit abandonment criterion (Phase 4 → revert). I commit to NOT spinning on this. If 1h after capture I don't know, revert and move on.

4. **Reverting reintroduces the GoTrue race that we tried to fix yesterday.** True. **Mitigation:** mobile retry-on-401 papers over much of the GoTrue race in practice. Auth log data from yesterday shows Murdoch's user did succeed in getting requests through over the last day even with the race. It's not 100% broken — it's "occasionally fails on first try, usually succeeds on retry." That's livable for launch.

5. **Supabase support ticket goes unanswered for 24h.** Likely. **Mitigation:** ticket is parallel insurance, not blocking. We proceed with revert if Phase 3 fails, support can give us a better answer later.

### What would have to be true for me to abandon this plan

- **If Phase 1 doesn't yield a captured bearer in 30 min, abandon Phase 1.** We're stuck with current data; revert is the right call.
- **If Phase 3 doesn't yield a confident diagnosis after one re-capture cycle, abandon further investigation.** Revert. Document. Move on.
- **If during Phase 4 I find a "fix" that requires more than 60 min to implement and test, treat it as suspect and prefer revert.** Big complex fixes for a not-fully-understood bug are exactly the failure mode of today.

### What I want from Murdoch

- Sanity-check this plan. Specifically: does the no-code-changes constraint relax for a one-time diagnostic instrumentation build if Charles Proxy doesn't pan out? My recommendation: yes, but it's your call.
- Decide: are you OK with reverting if Phase 3 fails? I think you should be. Reverting today is not "giving up" — it's "we don't understand this bug yet and shipping more guesses will hurt more than help." Revert + Supabase support ticket + post-launch revisit is a respectable path.
- Capture the bearer when ready. Phase 1.

I won't ship anything else without your explicit go-ahead. Even if I form a strong theory in Phase 3, I'll write it up and ask before I act. That's the discipline I've lacked all day.

---

## What this document is NOT

- It is not another diagnosis. I'm intentionally NOT proposing what's wrong.
- It is not a recommendation to fix-forward. I'm explicitly recommending data capture first.
- It is not optimistic. I think there's a >50% chance Phase 3 doesn't give us a confident answer and we revert. That's fine.
- It is not me asking for absolution. The process failures today were mine. The discipline going forward needs to be different.

The thing I keep getting wrong this week is that I treat each iteration as the FINAL iteration. "This time I'll get it." After the 4th wrong fix, the right move is "I will not propose a fix until I have data, even if that means saying 'I don't know yet' for hours." That's where I am now.

---

## Sources / data referenced

- `docs/auth-jwt-direct-refactor-plan-2026-05-06.md` — original plan for today's refactor
- `docs/jwt-direct-postdeploy-diagnostic-2026-05-07.md` — first post-failure diagnostic (JWKS rotation race theory)
- `docs/jwt-auth-strategy-opinion-2026-05-07.md` — last night's strategy opinion
- `SnapQuote-mobile/docs/production-auth-deep-audit-2026-05-06.md` — yesterday's deep audit (the canonical "stale bearer race" theory + Option A: stop competing with supabase-js)
- Sentry: SNAPQUOTE-MOBILE-G — "Error: Unauthorized" from `parseJsonResponse`, dated 2026-05-06 22:55 UTC, user `meemee@pee.com` test sign-up on `/api/public/onboard` — DIFFERENT bug from Murdoch's reported `/api/app/*` 401s
- Vercel runtime logs: Murdoch's mobile session 69f60d31 hit /api/app/leads/unlock 401 at 15:13:04 today, paired with retry; my fresh tokens at 15:01-15:04 and 16:00 all returned 200; production deployment is dpl_9G4btShg7pBNFtSzbSeQyGT4ZM2e
- Supabase auth logs: 5 successful refresh-token grants for mobile session 69f60d31 in the last hour, all status 200; same session has been active since 2026-05-06 23:30:07
- Supabase data: Murdoch has 2 OWNER memberships (`falconn` BUSINESS oldest + `Worcester Test Contractor` SOLO newer); both web and mobile select `falconn`; identities are email + google (no apple); 3 active sessions (curl, Chrome, mobile)
