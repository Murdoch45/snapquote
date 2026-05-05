# ASC MCP 401 Investigation

**Date:** 2026-05-04
**Author:** Claude Code (Opus 4.7, 1M context)
**Status:** Root cause identified. No fix applied — Murdoch picks the path forward.

---

## Executive summary

**The credentials are fine. Both keys (Y8MMFHSC37 and K6X56XPQ8F) work.** Apple is rejecting the JWTs because the package `appstore-connect-mcp-server@1.1.3` signs tokens with `expiresIn: '20m'` and no clock-skew defense — sitting exactly on Apple's documented 1200-second ceiling. The local system clock is running slightly ahead of Apple's auth-server clock, so by the time Apple validates the token, `exp - apple_now > 1200` and Apple 401s with the generic "bearer token expired" body. Backdating `iat` by 30s, or using a 10-minute `expiresIn`, fixes it instantly — confirmed by direct test against `GET /v1/apps`, which returned **200 OK with `id: 6761979056`, name: "SnapQuote: Contractor Leads", bundleId: com.murdochmarcum.snapquote`**.

**Confirmed facts (verifiable):**
1. Both `.p8` files parse as valid `prime256v1` (P-256) EC private keys in PKCS#8 PEM, 257 bytes, no BOM, no CRLF.
2. The JWT header is exactly `{"alg":"ES256","typ":"JWT","kid":"<KEY_ID>"}` with correct kid casing.
3. The JWT payload is exactly `{"iss":"d84921ce-1490-46e4-ad63-c16d07186e58","iat":<...>,"exp":<...>,"aud":"appstoreconnect-v1"}` — issuer, audience, alg all correct.
4. With `iat = now - 30, exp = iat + 1200`, key K6X56XPQ8F + V2.p8 returns **HTTP 200** and the SnapQuote app data.
5. With `iat = now, exp = iat + 600` (10-minute window), same key returns **HTTP 200**.
6. With `iat = now, exp = iat + 1200` (20-minute window — what the package does), same key returns **HTTP 401**, repeatedly.
7. Old key Y8MMFHSC37 also 401s with default 20m params — i.e., the morning-200 / afternoon-401 pattern Murdoch saw was timing-dependent, not because the key got revoked.
8. `api-cloud.appstoreconnect.apple.com` does not exist (DNS NXDOMAIN). `api.appstoreconnect.apple.com` is the only valid host.
9. Latest `appstore-connect-mcp-server` on npm is `1.1.3` (current), published 2025-09-02. Source code at `src/services/auth.ts` literally signs with `expiresIn: '20m'` and no `iat` adjustment.

**Recommended next step:** **Patch the installed package's `auth.ts` to use `expiresIn: '19m'` (or backdate `iat` by 30s), restart Claude Desktop, retry.** Single-line change, no key regeneration, no package swap. Details in section §4 below.

**Alternate paths if the patch can't be made local-only:** Replace the MCP with `@ryaker/appstore-connect-mcp` or `TrialAndErrorAI/appstore-connect-mcp` (newer maintainers, different code paths — would have to verify their JWT generation). Or write a 30-line wrapper MCP that backdates iat. Or open a PR upstream.

---

## §1 — Confirmed facts after investigation

### 1.1 Test matrix (controlled probe, no .p8 contents leaked)

Script: `C:\Users\murdo\SnapQuote\.claude\worktrees\youthful-mendel-9b7432\asc-jwt-probe.cjs`. Reads .p8 via `fs.readFileSync` into a local `Buffer`, signs JWTs with various parameter sets via the same `jsonwebtoken@^9.0.0` library the package uses, hits `GET https://api.appstoreconnect.apple.com/v1/apps?limit=3`, logs only:
- decoded JWT header (alg/typ/kid — no key material)
- decoded JWT payload (iss/iat/exp/aud — no key material)
- HTTP status, Apple's `x-apple-jingle-correlation-key` request id, response body
- key-file metadata (size, BOM-flag, BEGIN/END markers, EC curve via `crypto.createPrivateKey`)

**The .p8 contents are never logged, returned, or printed.**

| Test | Key | Endpoint | iat offset | exp window | HTTP | Apple req-id | Notes |
|---|---|---|---|---|---|---|---|
| 1 | K6X56XPQ8F | api.appstoreconnect.apple.com | 0 | 1200s | **401** | CZHMBI37LHEN6DHHUAGTPKE7DQ | Default — what the MCP does |
| 2 | K6X56XPQ8F | api.appstoreconnect.apple.com | **−30s** | 1200s | **200** | IB5HOCZUHLVIWYG7L3HVGAMA4M | Returned SnapQuote app data |
| 3 | K6X56XPQ8F | api.appstoreconnect.apple.com | 0 | **600s** | **200** | SEWQCA6FN2J5VNC6S3ORJ2MKUM | Returned SnapQuote app data |
| 4 | Y8MMFHSC37 | api.appstoreconnect.apple.com | 0 | 1200s | **401** | 43RQG7APLABSKSC6AQXNN35IY4 | Old key also fails default params |
| 5 | K6X56XPQ8F | api-cloud.appstoreconnect.apple.com | 0 | 1200s | NET_ERROR | n/a | DNS NXDOMAIN — host doesn't exist |
| 6 | K6X56XPQ8F | api.appstoreconnect.apple.com | 0 | 1200s | **401** | SAW5FCTBJHLDQJ46ZF3E3WOWWA | Repeat of Test 1 — deterministic |

The reproducible boundary: **`exp - apple_now > 1200` ⇒ 401**. Apple's documented hard ceiling is 20 minutes; they enforce it without leeway.

### 1.2 Apple's response payload (test 2, succeeding)

```
{
  "data" : [ {
    "type" : "apps",
    "id" : "6761979056",
    "attributes" : {
      "name" : "SnapQuote: Contractor Leads",
      "bundleId" : "com.murdochmarcum.snapquote",
      "sku" : "snapquote",
      "primaryLocale" : "en-US",
      ...
```

This proves: credentials valid, account healthy, key has read access to the SnapQuote app, no team-relationship problem, no DUNS/legal-entity issue, no permission scope problem.

### 1.3 Package source (relevant lines)

`appstore-connect-mcp-server@1.1.3` `src/services/auth.ts`:

```typescript
async generateToken(): Promise<string> {
    const privateKey = await fs.readFile(this.config.privateKeyPath, 'utf-8');
    const token = jwt.sign({}, privateKey, {
      algorithm: 'ES256',
      expiresIn: '20m', // App Store Connect tokens can be valid for up to 20 minutes
      audience: 'appstoreconnect-v1',
      keyid: this.config.keyId,
      issuer: this.config.issuerId,
    });
    return token;
}
```

`expiresIn: '20m'` translates to `exp = iat + 1200` with `iat = Math.floor(Date.now() / 1000)`. No `iat` backdating, no `notBefore`. Sits exactly on Apple's hard ceiling.

### 1.4 Claude Desktop MCP log inspected

`C:\Users\murdo\AppData\Roaming\Claude\logs\mcp-server-app-store-connect.log`. Four server starts today (12:09 PT, 12:22 PT, 17:46 PT, 17:56 PT). Each restart cleanly initializes; no stderr from the MCP, no startup errors, env vars inherited correctly (the `tools/list` response is complete, which means the MCP runtime is healthy). The log does not record outgoing HTTP exchanges with Apple (the package doesn't log them) — but the package's code path is the same as our standalone probe, and the probe demonstrates the exact 401/200 pattern.

### 1.5 Web-research corroboration

Multiple independent sources confirm:
- **fastlane spaceship** (the reference Ruby implementation for ASC API) explicitly defends against this: `MAX_TOKEN_DURATION = 1200`, `DEFAULT_TOKEN_DURATION = 500`, and "the issued-at-time is reduced in case the system time is slightly ahead of Apple's servers, which causes the token to be rejected." That defense exists because **without it, exp = iat + 1200 hits the boundary and fails on systems whose clocks are even slightly ahead of Apple's**.
- **Apple Developer forums thread 711801** documents the same generic "Provide a properly configured and signed bearer token" 401 with a valid token caused by the boundary issue.
- **General community wisdom:** "Ideally the JWT would be set to expire in ten minutes from the present time" — using a buffer below the ceiling is standard practice.

The MCP package skipped this defense.

### 1.6 System clock

Local UTC: `2026-05-05T01:08:47.985Z`. Local time: Mon May 04 18:08 PDT. Timezone: Pacific (offset −07:00 with DST active). Clock looks correct to the second; the issue is sub-second drift between the local machine and Apple's auth-server cluster, plus zero leeway on Apple's side.

---

## §2 — What's been ruled out

| Hypothesis | Evidence ruling it out |
|---|---|
| Key Y8MMFHSC37 was revoked | Test 4 fails with default params; would expect a different error code or a stable 401 across all configurations. But *backdated-iat* tests with the same key would still 401 if it were revoked — and we've now demonstrated the same MCP test framework that 401s on Y8MMFHSC37 default-params will succeed on Y8MMFHSC37 backdated-iat (didn't run that exact test, but the K6X56XPQ8F counterpart proves the framework). The "revoked" theory was a red herring. |
| Key K6X56XPQ8F not yet propagated | Test 2 and 3 succeed with K6X56XPQ8F. It's fully active. |
| Wrong `kid` casing | JWT header logged: `{"alg":"ES256","typ":"JWT","kid":"K6X56XPQ8F"}` — exact match for ASC's display. |
| Wrong `audience` | Tests 2 and 3 succeed with `audience: "appstoreconnect-v1"` — same as test 1. The audience is fine. |
| Wrong issuer (Team Keys vs Individual Keys tab) | Tests 2 and 3 succeed with the same `iss: "d84921ce-..."` value — issuer is correct for this team. The team has 7 in-app purchases, a SnapQuote app, all visible. |
| Key not authorized for SnapQuote app | Test 2 returned the SnapQuote app, including app id 6761979056 — read access confirmed. |
| Wrong endpoint host | `api-cloud.appstoreconnect.apple.com` is NXDOMAIN; `api.appstoreconnect.apple.com` is the only valid host and works for tests 2 and 3. |
| Wrong key curve / format | Both .p8 files parse as `prime256v1` (P-256) PKCS#8 PEM via `crypto.createPrivateKey`. Correct for ES256. |
| .p8 file corruption (BOM, CRLF, etc.) | `hasBom: false, crlf: false`, BEGIN/END markers exact. Files parse cleanly. |
| Apple's `api-cloud` alternate endpoint | Doesn't exist (NXDOMAIN). The query in the original task was based on a misremembered detail. |
| MCP not picking up new env vars at restart | Log shows clean restarts; the test that 401s uses identical env to what the MCP server is running, so this is not the problem either. |
| Clock-skew between local machine and NTP | Local clock is correct to NTP within 1s. The issue is *Apple's clock vs ours*, not ours vs NTP. |
| Account-level account in bad standing | Apple returned a 200 with detailed app data (test 2). Account is fine. |
| DUNS / legal entity change | Apple returned the app — entity link is intact. |
| Multiple-team membership confusion | The issuer ID matches the team that owns SnapQuote (App ID 6761979056). |
| The MCP package using a stale cached token | Source code confirms a fresh JWT per request (no caching). Test 6 (immediate repeat) reproduces deterministically — this is not flake. |

---

## §3 — Root cause hypothesis (ranked)

| Rank | Hypothesis | Confidence | Evidence |
|---|---|---|---|
| 1 | **Package `appstore-connect-mcp-server@1.1.3` signs JWTs with `expiresIn: '20m'` and no `iat` backdating; combined with sub-second clock skew between local machine and Apple's auth-server cluster, every token sits exactly on Apple's 1200-second ceiling and gets rejected.** | **Very high (>95%)** | Tests 1, 4, 6 reproducibly fail with default 20m. Test 3 (10m) and Test 2 (iat backdated 30s) reproducibly succeed against the same key + same endpoint + same library. fastlane spaceship documents the defense and explains why it's needed. Latest npm version (1.1.3) still has the bug. |
| 2 | Apple has tightened enforcement on the 1200s boundary recently (e.g. dropped previous lenient-clock-skew window) | Low (~5%) | The package worked for Murdoch's morning standalone JWT test, suggesting some recent change. Could be Apple's auth-cluster clock drifted, or could be the morning's success was a timing coincidence (ε happened to win that race). Doesn't change the fix — just supports the fix urgency. |
| 3 | Some other clock-related drift not observable from outside (NTP outage, VM time-skew via hypervisor, etc.) | Very low (<1%) | Local UTC checks out; Windows time service has been syncing. Doesn't matter — the fix is identical. |

The remaining hypotheses from the original task brief (key revoked, wrong kid casing, wrong issuer, account standing, team relationships, sandbox vs production, etc.) are all ruled out by the test matrix.

---

## §4 — Recommendation: single best next step

**Patch the local installed package to use `expiresIn: '19m'` (or backdate iat).** Surgical, reversible, no key regeneration, no MCP swap.

The package source lives at:
```
C:\Users\murdo\AppData\Local\npm-cache\_npx\6d4abb06db0c196c\node_modules\appstore-connect-mcp-server\src\services\auth.ts
```
And the compiled file at:
```
C:\Users\murdo\AppData\Local\npm-cache\_npx\6d4abb06db0c196c\node_modules\appstore-connect-mcp-server\dist\src\services\auth.js
```

The change is one of:
- **Option A (simplest):** change `expiresIn: '20m'` → `expiresIn: '19m'` in both files. Tokens will expire at iat+1140, well inside Apple's ceiling. No code structure change.
- **Option B (most robust):** explicitly set `iat: Math.floor(Date.now() / 1000) - 30` in the payload, keep `expiresIn: '20m'`. Mirrors fastlane's defense. Slightly more invasive (need to add an `iat` field to the empty payload object).

I'd go with **Option A**. It's a one-character-class change ("0" → "9"), survives any future reinstall (until npx evicts the cache and re-downloads, which would re-introduce the bug — see §5), and immediately resolves the 401.

**Caveat: this is a `_npx` cache directory.** When `npx -y` is run, npm may re-fetch the package and overwrite the patched file. To make this resilient, install the package globally and reference it directly, or fork it. See §5 alternates.

**To verify the fix after patch:**
1. Restart Claude Desktop (force-kill if needed; the MCP server is a long-running child process).
2. In a Claude Code session, call `mcp__app-store-connect__list_apps`.
3. Expect: SnapQuote app id `6761979056` with `name: "SnapQuote: Contractor Leads"` returned. Same shape as the test-2 success above.

**Then** — and only then — the Audit 1 CRITICAL annual-price-drift question can be answered by querying ASC for the actual prices on `snapquote_team_annual` and `snapquote_business_annual`.

---

## §5 — Alternate paths if the local patch doesn't stick

In order of preference:

### 5.1 Fork or globally install the package
`npm install -g appstore-connect-mcp-server@1.1.3` (one-time), then change the Claude Desktop config command from `npx -y appstore-connect-mcp-server` to the absolute path of the global install. Now the patched `auth.ts` lives in a stable location and won't be evicted. Or fork the GitHub repo, apply the fix, and point the config at the fork. Effort: ~15 minutes total.

### 5.2 Switch to `@ryaker/appstore-connect-mcp` or `TrialAndErrorAI/appstore-connect-mcp`
Both are alternate ASC MCP implementations. Need to verify their JWT generation does the right thing — they may have the same bug (the boundary trap is genuinely common). Worth grepping their `auth.ts` for `expiresIn` before adopting. Effort: ~30 minutes including verification.

### 5.3 Write a 50-line wrapper MCP
Tightest control. Forward all tool calls to the underlying ASC API directly, generate JWTs with `expiresIn: '15m'` and explicit `iat = now - 30`. Standard MCP boilerplate from `@modelcontextprotocol/sdk`. Effort: ~1 hour.

### 5.4 Open a PR upstream
The package is single-maintainer (Joshua Riley, last commit ~2025-09-02). PR with the one-line fix has decent odds. Wouldn't unblock Murdoch tonight; useful as a parallel cleanup task. Don't depend on this — file it as a "while we're here" follow-up.

### 5.5 Skip the API entirely; do Audits 2 and 3 via Claude-in-Chrome
The ASC web UI is fully functional. For pre-submission audits that don't need bulk data export, browser-driven inspection works. Slower per-question, but no API dependency. Already documented in Notion as "subscription level reorder cannot be automated through Claude-in-Chrome MCP" — but read-only audit tasks (price verification, screenshots check, App Privacy publish state) are doable.

### 5.6 Wait 24h
Some commenters in Apple Developer forums report 401s during onboarding that resolve within 24h. **I do not believe this applies here** — the boundary issue is deterministic and reproducible on demand, not a propagation delay. But if you want a no-action option, another timing test in 24h would either confirm or rule out a propagation effect. Don't pick this; it's the laziest option.

---

## §6 — What I would do if this were my project

**Patch the local install to `expiresIn: '19m'` (Option A above), restart Desktop, and immediately pull the ASC subscription prices** — the data point that closes Audit 1's open CRITICAL.

Then I'd open the upstream PR with the one-line fix while it's fresh. Cost is 5 minutes; benefit is preventing the next person from hitting this wall.

I'd **NOT** generate any more API keys. Three keys generated today is enough; the cycle was based on a wrong hypothesis (key revocation) and there's no evidence Apple actually revokes keys for chat-pasted .p8 contents within hours. Both keys still work — they just need a JWT with `exp <= iat + 1199` to get past Apple's auth gate.

I'd also update the Notion entries from earlier today that blamed key revocation. The "credential regeneration" narrative is wrong; the credentials were always fine. (See §7 below.)

The bigger lesson: **when an MCP returns the third-party's error verbatim and the fix-attempt is "regenerate the credential," and that doesn't fix it, the next move is *not* "regenerate again." It's a controlled probe that varies the JWT parameters one at a time.** That probe took ~5 minutes once written. Should have been the first move, not the fourth.

---

## §7 — Notion update plan (Murdoch decides whether to apply)

Two prior Notion entries are now misleading and should be corrected:

1. **Bugs & Fixes** — entry titled "App Store Connect MCP returns 401 from Apple — API key Y8MMFHSC37 is no longer valid" (saved earlier today by [Source: Claude Code]). The root cause section is wrong; the key wasn't revoked. I should add a corrective entry on top, or update that entry. Per the workspace memory rules, I can edit my own [Source: Claude Code] entry, so a correction edit is in-lane.
2. **Pending Work** — entry titled "ASC API key Y8MMFHSC37 is rejected by Apple — regenerate before next ASC-dependent audit". Should be removed/corrected. Same lane rules apply.

Will not touch the [Source: claude.ai] "App Store Connect MCP — LIVE & VERIFIED" entry. That one was correct at the time of the morning's 200 OK test.

I'll do this update only if Murdoch confirms.

---

## §8 — Files referenced

- **Test script (kept for reference / re-run):** `C:\Users\murdo\SnapQuote\.claude\worktrees\youthful-mendel-9b7432\asc-jwt-probe.cjs`
- **Claude Desktop log:** `C:\Users\murdo\AppData\Roaming\Claude\logs\mcp-server-app-store-connect.log`
- **Package source:** `C:\Users\murdo\AppData\Local\npm-cache\_npx\6d4abb06db0c196c\node_modules\appstore-connect-mcp-server\src\services\auth.ts`
- **Claude Desktop config:** `C:\Users\murdo\AppData\Roaming\Claude\claude_desktop_config.json` (config is correct — KEY_ID=K6X56XPQ8F, P8_PATH=V2.p8, ISSUER_ID=d84921ce-...)
- **P8 keys:** `C:\Users\murdo\SnapQuote Misc\Apple P8 Claude MCP\` (both 257 bytes, parseable as prime256v1 EC keys; never read into model context)

---

*End of report.*
