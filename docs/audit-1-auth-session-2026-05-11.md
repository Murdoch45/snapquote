# Audit 1 — Auth & Session Lifecycle — 2026-05-11

**Auditor:** Claude Code
**Scope:** Signup → email verification → login → session lifecycle → forgot/reset → invite → signout → account deletion. Web (Next.js) and mobile (Expo). Token-verification hardening from Audit 8 (HS256 removal, issuer pinning, timing-safe bearer compare, recovery-only reset gate on web) was re-verified live, not re-audited.
**HEAD verified against:**
- Web: `C:\Users\murdo\SnapQuote` @ `40d1e6a` (branch `main`)
- Mobile: `C:\Users\murdo\SnapQuote-mobile` @ `0024fdb` (branch `main`)
- Supabase project: `upqvbdldoyiqqshxquxa` (live MCP)
- Sentry org: `snapquote` (live MCP)
- Date verified: 2026-05-11

---

## TL;DR

- **Critical:** none. Audit 8's token-verification hardening (ES256-only, issuer-pinned, recovery-only reset on web) still holds at HEAD.
- **High:** 5 findings. The biggest is that Audit 8 H7 (mobile SecureStore migration) is **NOT in HEAD** — Notion claims it shipped on 2026-05-09 but `lib/supabase.ts` still uses AsyncStorage. Two H-level mobile parity gaps (no recovery-session gate on `/(auth)/reset-password`, tokens in URL fragment for stripe-return) and two operational gaps (no Apple nonce binding, silent signOut failures).
- **Medium / Low:** 7 findings. Leaked-password protection still disabled, inconsistent password minimums between platforms, missing IP rate limit on signup bootstrap, advisor warnings on `is_org_member` / `is_org_owner` SECURITY DEFINER exposure.
- **Live data:** 96 users (95 email, 1 apple, 0 google), 39 sessions across 35 users, 7 sessions refreshed in last 7 days. No auth-related Sentry issues in the unresolved queue.

---

## Section 1 — Session Lifecycle Map

### Signup (email/password)

Web (`components/auth/SignupForm.tsx:64-104`):
1. Turnstile token required (`SignupForm.tsx:68-72`).
2. `supabase.auth.signUp({email, password})` against browser client (`createBrowserClient` from `@supabase/ssr`).
3. POST `/api/public/auth/bootstrap` with the turnstile token to provision the org (`app/api/public/auth/bootstrap/route.ts:26-62`).
4. Bootstrap verifies turnstile server-side (`bootstrap/route.ts:5-24`), reads `supabase.auth.getUser()` from cookies, calls `ensureOrganizationMembershipForUser(...)` (`bootstrap/route.ts:49-52`).
5. Redirects to `/onboarding` (`SignupForm.tsx:103`).

Mobile (`app/(auth)/signup.tsx:25-69`):
1. `isValidEmail` + ≥6 char password (`signup.tsx:30-41`).
2. `supabase.auth.signUp({email, password})` against the mobile Supabase client.
3. If session created → `router.replace("/onboarding")` (`signup.tsx:62-64`).
4. Else → "Check your email" message and route to login.

No turnstile or per-IP rate limit on the mobile signup path or the web `/api/public/auth/bootstrap` route (see M3).

### Signup (Apple)

Web: `components/auth/SignupForm.tsx:106-135` → `supabase.auth.signInWithOAuth({provider:"apple", options:{redirectTo: …/auth/callback?next=/app}})` (PKCE flow handled by Supabase Studio with Service ID `com.murdochmarcum.snapquote.web`).

Mobile (`app/(auth)/signup.tsx:74-104` and `app/(auth)/login.tsx:68-98`):
1. Native `expo-apple-authentication.signInAsync` with FULL_NAME + EMAIL scopes.
2. `supabase.auth.signInWithIdToken({provider:"apple", token: credential.identityToken})`.
3. **No nonce parameter** (see H5).
4. Audience claim on mobile-issued identity tokens is the iOS bundle id `com.murdochmarcum.snapquote`; Supabase's Apple provider config has to accept this audience.

### Signup (Google)

Web: `components/auth/SignupForm.tsx:106-135` and `components/auth/LoginForm.tsx:82-109` — `signInWithOAuth({provider:"google", options:{redirectTo: …/auth/callback}})`. PKCE callback handler at `app/auth/callback/route.ts:25-74` exchanges code for session.

Mobile: `app/(auth)/login.tsx:100-154` and `app/(auth)/signup.tsx:106-160` — `signInWithOAuth({provider:"google", options:{redirectTo:"snapquotemobile://", skipBrowserRedirect:true}})` → `WebBrowser.openAuthSessionAsync(...)` → parse returned URL for `code` (PKCE) or `access_token`/`refresh_token` (legacy implicit fallback). Live data shows 0 Google users today (`auth.users` query), so this path is exercised only in test.

### Email verification & recovery

Both flows go through `app/auth/confirm/route.ts:1-83` (web). Mobile re-handles the same Universal Link inside the app via `app/_layout.tsx:79-132`.

- `verifyOtp({token_hash, type})` consumes the OTP and creates the session cookies via `createServerClient` with cookies bound to the redirect response (`confirm/route.ts:42-57`).
- On `type=recovery` AND `data.user.id`, sets the signed `sq-pwr` recovery cookie (`confirm/route.ts:72-80`) — HttpOnly, Secure (prod), SameSite=Lax, 10-minute TTL.

### Login

Web (`components/auth/LoginForm.tsx:63-80`): `signInWithPassword`. On success, `router.replace(inviteAcceptPath ?? "/dashboard")` (`LoginForm.tsx:79`). Note: `/dashboard` not `/app` — invite-aware override redirects to `/invite/accept?token=...` if `invite_token` searchparam was present.

Mobile (`app/(auth)/login.tsx:24-63`): `signInWithPassword`; on success, `RootNavigator` redirects.

### Session storage

Web: `@supabase/ssr` writes the `sb-<projectref>-auth-token` and refresh cookies via the cookie callback wired in `lib/supabase/server.ts:22-37` and `middleware.ts:62-78`. Cookie attributes (HttpOnly, Secure, SameSite) are set by `@supabase/ssr`'s defaults, not overridden in our code.

Mobile: `lib/supabase.ts:38-45` — **AsyncStorage** (`@react-native-async-storage/async-storage`), not SecureStore. `autoRefreshToken: true`, `persistSession: true`, `detectSessionInUrl: false`. This is the H1 finding.

### Session refresh

Web: `middleware.ts:81` calls `supabase.auth.getUser()` on every non-`/api/public` request, which triggers refresh-token rotation. Cookies are re-set on the response (`middleware.ts:71-76`).

Mobile: `supabase-js` `autoRefreshToken: true` rotates silently. `lib/auth.tsx:158-180` subscribes to `onAuthStateChange` — explicitly does NOT set `isLoading=true` on TOKEN_REFRESHED to avoid tearing down the tabs subtree (extensive comment block at `lib/auth.tsx:163-178` documents the SNAPQUOTE-MOBILE-9 incident).

### Multi-device sessions

`auth.sessions` query results (`upqvbdldoyiqqshxquxa`):
- 39 active sessions, 35 distinct users → average 1.11 sessions/user.
- No user has more than 3 sessions (HAVING COUNT(*)>3 returned empty).
- User-agents in last 14d: Vercel Edge Functions (3), desktop Chrome on Windows (2), iPhone Safari (1), `SnapQuote/18 CFNetwork/3826.600.41` (1, this is the native mobile build).

### Signout

Web — 3 callsites of `supabase.auth.signOut()`:
- `components/Sidebar.tsx:155` and `:299` — user-initiated.
- `components/SettingsForm.tsx:871` — user-initiated.

Mobile — 1 runtime callsite at `lib/auth.tsx:338`:
```
void supabase.auth.signOut().catch(() => null);
```
- Default scope is `global` (revokes refresh token at GoTrue) — but **the `.catch(() => null)` silently swallows errors** (see H4).
- Before the supabase call, local state is wiped (`lib/auth.tsx:330-337`): session, userId, orgId, role, pendingInviteToken, inviteError cleared; STRIPE_RETURN_AT_KEY removed; per-device push token row deleted from `push_tokens` (`lib/auth.tsx:316-321`).

### Account deletion

`app/api/app/account/delete/route.ts:182-372`:
- Path goes through `requireMemberForApi(request)` (`account/delete/route.ts:183`).
- Owner: tears down the whole org (Stripe + RC cancellations, lead photos, push tokens, audit log, then `organizations.delete()`).
- Member: deletes membership row only.
- Final step: `admin.auth.admin.deleteUser(auth.userId)` (`account/delete/route.ts:351`). GoTrue cascades and revokes all active sessions for the user.

Confirmed: account deletion does invalidate every session for the deleted user.

---

## Section 2 — Cookie/Storage Configuration

### Web cookies

- Recovery cookie `sq-pwr` (`lib/auth/recoveryCookie.ts:25-26`, set at `app/auth/confirm/route.ts:73-79`):
  - HttpOnly: `true`
  - Secure: `process.env.NODE_ENV === "production"` (true in prod)
  - SameSite: `lax`
  - Path: `/`
  - max-age: `600` (10 minutes)
  - Format: `${userId}.${expiresAtMs}.${hmacSha256}` with HMAC keyed by `SUPABASE_SERVICE_ROLE_KEY` (domain-separated by literal prefix `sq-recovery-cookie-v1:`).
  - Verification (`lib/auth/recoveryCookie.ts:58-76`): length check + `timingSafeEqual` constant-time signature comparison.

- Supabase session cookies (`sb-*`): set by `@supabase/ssr` — attributes follow library defaults (HttpOnly, Secure in production, SameSite=Lax). Not overridden in our code.

### Mobile storage

- **AsyncStorage** (`lib/supabase.ts:1, 38-45`). Storage adapter is `AsyncStorage` for native/browser and a `noopStorage` for the Expo static-export Node SSR pass.
- No SecureStore usage anywhere in the mobile repo: `grep -r "SecureStore\|expo-secure-store"` returns **zero matches**.
- `package.json` does not declare `expo-secure-store`.

### TTLs (Supabase project config, inferred from live behavior)

Could not directly query GoTrue config via MCP. From session table:
- Oldest active session: `2026-03-18 21:14:28` (~54 days). Refresh token rotation extends sessions transparently; sessions don't expire until refresh fails.
- Most recent refresh: `2026-05-11 16:22:07`.

---

## Section 3 — OAuth Provider Config (live)

`auth.users` provider distribution (`upqvbdldoyiqqshxquxa`):
- email: 95 users
- apple: 1 user (`bffcc8d0-1cbb-459f-b4c5-0bf4d4fb94f7`, signed in `2026-05-08 20:05:48`)
- google: 0 users

Could not query GoTrue's `auth.config` table via MCP. The only Apple user signed in 2026-05-08 — confirms the Apple provider is configured and at least one end-to-end flow works. No Google users — that path is essentially untested in production.

---

## Section 4 — Findings

### CRITICAL

None. Audit 8's token verification hardening is intact at HEAD:

- HS256 fallback removed in `lib/auth/verifyJWT.ts` — the function only verifies via JWKS (ES256) at line 147. Comment block at lines 18-20 documents the removal.
- Issuer pinning enforced — `getExpectedIssuer()` at `lib/auth/verifyJWT.ts:108-121` constructs `${NEXT_PUBLIC_SUPABASE_URL}/auth/v1`, passed as `issuer` option at line 149.
- `isAuthorizedBearer` uses `timingSafeEqual` at `lib/auth/timingSafeBearer.ts:40-49` — used by every cron handler.
- Web reset-password page IS gated on the recovery cookie at `app/(public)/reset-password/page.tsx:21-58` — verifies cookie + active session userId match before rendering form.

### HIGH

**H1. Mobile auth tokens stored in AsyncStorage, not SecureStore.**
- Evidence: `C:\Users\murdo\SnapQuote-mobile\lib\supabase.ts:38-45` imports `AsyncStorage` from `@react-native-async-storage/async-storage` and passes it as `auth.storage`. `grep -r "SecureStore\|expo-secure-store" C:\Users\murdo\SnapQuote-mobile` returns **zero matches** (verified live, not via cache). `git log --oneline -20 lib/supabase.ts` shows only 3 commits, none containing SecureStore work.
- Risk: Refresh tokens persisted in AsyncStorage are included in iCloud / iTunes app data backups by default (SecureStore items default to `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` — non-syncable). A stolen device backup, malicious app with file-system access on a jailbroken device, or sync to attacker-controlled iCloud account → refresh tokens leak → attacker can mint access tokens for that user indefinitely until the user signs out everywhere.
- Notion claim: page "[2026-05-09] [Source: Claude Code] — Mobile security hardening (Audit 8 H7, H8, M9, M10)" says SecureStore migration shipped with an AsyncStorage→SecureStore copy + delete migration. **HEAD does not contain this code.** Either the work never landed in `main`, was reverted, or was made-up in the Notion entry.
- Cross-flag: Audit 8 H7.

**H2. Mobile reset-password screen has no recovery-session gate.**
- Evidence: `C:\Users\murdo\SnapQuote-mobile\app\(auth)\reset-password.tsx:33` calls `supabase.auth.updateUser({password})` directly with no equivalent of the `sq-pwr` recovery cookie check the web equivalent enforces at `app/(public)/reset-password/page.tsx:21-58`.
- Practical attack surface: narrower than web before Audit 8 H5, because `RootNavigator` at `app/_layout.tsx:307-309` redirects logged-in users with an `orgId` away from `/(auth)/*` to `/(tabs)`. But:
  - A user with an active session and no org assigned (mid-onboarding) is not redirected.
  - A deep-link-triggered `router.replace("/(auth)/reset-password")` at `app/_layout.tsx:113` momentarily renders the screen before RootNavigator's redirect runs on the next commit — race window.
  - The defense-in-depth principle Audit 8 H5 closed on web is missing on mobile.
- Cross-flag: Audit 8 H5 web parity.

**H3. Tokens (incl. refresh) in URL fragment for mobile→web Stripe return.**
- Evidence: `C:\Users\murdo\SnapQuote-mobile\lib\utils\authBrowser.ts:21-25`:
  ```
  const url = accessToken && refreshToken
    ? `${baseUrl}#access_token=${accessToken}&refresh_token=${refreshToken}&type=bearer`
    : baseUrl;
  ```
  Used by mobile to open authenticated web pages (`openAuthenticatedBrowser` called from settings, plan, etc.).
- Risk: URL fragments are not sent in `Referer` headers, but they ARE:
  - Visible in browser history (in-app SFSafariViewController history sometimes persists in app sandbox).
  - Logged by crash-reporters (Sentry will redact `#access_token=…` only if a denylist rule is configured — verify the Sentry breadcrumb scrubbing for URLs).
  - Logged by some webview engines.
  - Cached in the URL bar.
  Refresh tokens are long-lived (default ~1 year unless rotated). Leaking one gives an attacker unlimited access-token minting until the user signs out everywhere or the org owner deletes the account.

**H4. Mobile signOut errors silently swallowed.**
- Evidence: `C:\Users\murdo\SnapQuote-mobile\lib\auth.tsx:338`:
  ```
  void supabase.auth.signOut().catch(() => null);
  ```
- Risk: When the network is down or GoTrue is unreachable, the local session is wiped (the user sees themselves logged out) but the refresh token is NOT revoked at GoTrue. A stolen refresh token (see H1) remains valid. No Sentry breadcrumb, no toast, no retry. The user thinks they're logged out everywhere; they're not.
- Recommended (out of scope for read-only audit): capture the error to Sentry, retry with backoff on next foreground, or display a "couldn't sign out everywhere — try again with network" hint.

**H5. Apple Sign-In on mobile uses no nonce binding.**
- Evidence: `C:\Users\murdo\SnapQuote-mobile\app\(auth)\login.tsx:71-85` and `app\(auth)\signup.tsx:77-91`:
  ```
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [FULL_NAME, EMAIL]
  });
  ...
  await supabase.auth.signInWithIdToken({
    provider: "apple",
    token: credential.identityToken
  });
  ```
  No `nonce` option passed to either `signInAsync` or `signInWithIdToken`.
- Risk: Apple's identity token includes a `nonce` claim if the request supplied one. Without nonce binding, a stolen identity token can be replayed against `signInWithIdToken` from a different device. The mitigation Apple recommends is to:
  - Generate a random nonce, hash it (SHA-256), pass the **hashed** nonce as `nonce` to `signInAsync`.
  - Pass the **raw** nonce to `signInWithIdToken({nonce})`.
  - Supabase verifies the JWT's `nonce` claim matches the SHA-256 hash of the supplied raw nonce.
- Cross-flag: Audit 5 / Apple App Review readiness, but is also a token-replay vulnerability.

### MEDIUM

**M1. Leaked-password protection still disabled.**
- Evidence: Supabase advisor `auth_leaked_password_protection` returned WARN level at 2026-05-11 query.
- Cross-flag: Audit 9 M4. Same finding still open.

**M2. Inconsistent password minimum length.**
- Mobile signup (`app/(auth)/signup.tsx:37`) and login (`app/(auth)/login.tsx:36`): 6 chars.
- Mobile reset-password (`app/(auth)/reset-password.tsx:21`): 8 chars.
- Web reset-password (`components/auth/ResetPasswordForm.tsx:22`): 8 chars.
- Web signup (`components/auth/SignupForm.tsx`): no client-side minimum (Supabase server enforces project-level minimum, currently 6 per default).
- Risk: user creates a 6-char password on mobile signup, can't use the same on reset. Minor UX. The real fix is to raise Supabase's project-level minimum to 8 and align all clients.

**M3. Web signup `/api/public/auth/bootstrap` has no per-IP rate limit.**
- Evidence: `app/api/public/auth/bootstrap/route.ts:26-62`. Turnstile token required (`bootstrap/route.ts:31-38`) but no `rateLimit()` call. Compare to `forgot-password` (`app/api/public/auth/forgot-password/route.ts:28-35`) which gates on `email:` and `ip:` keys.
- Risk: Turnstile alone doesn't prevent a determined attacker with valid tokens (purchasable or solvable via headless browser) from creating thousands of accounts. Per-IP cap (e.g. 10 signups/hr) would scope the blast radius.

**M4. Mobile signup auto-routes to /onboarding before email confirmation.**
- Evidence: `app/(auth)/signup.tsx:62-68`. `if (data.session)` → straight to `/onboarding`. With Supabase project's "Confirm email" disabled (current live state: all 95 email users have `email_confirmed_at` non-null at signup time per query), every signup gets an immediate session and skips verification entirely.
- Risk: a mis-typed email creates an account the real user can't recover. A throwaway-email signup gets full app access without proving ownership.
- This is a Supabase project setting (Authentication → Email → "Confirm email"). Could not verify the setting directly via MCP — recommend confirming in Studio.

**M5. Membership tiebreaker differs between web and mobile.**
- Web (`lib/auth/requireRole.ts:175-181`): `ORDER BY role DESC, created_at ASC` — OWNER membership first, then oldest.
- Mobile (`lib/auth.tsx:33-35, 60-69`): `ORDER BY created_at ASC` only, then `rows.find(r => r.role === "OWNER") ?? rows[0]`. The post-fetch find picks OWNER if any, but the SQL doesn't sort by role — so for a user with both OWNER and MEMBER memberships, the `created_at ASC` ordering plus the post-fetch find yields the same answer as the SQL `ORDER BY role DESC, created_at ASC`. Functionally consistent for now, but the divergence is a latent bug if logic is ever extended.

**M6. `is_org_member` / `is_org_owner` still callable via /rest/v1/rpc by authenticated users.**
- Evidence: Supabase advisor `authenticated_security_definer_function_executable` returns WARN for `is_org_member(uuid)` and `is_org_owner(uuid)`. Live grants (`pg_proc` query): both functions have `authenticated:EXECUTE` and `service_role:EXECUTE`.
- Migration `20260508234346_rpc_hardening_search_path_row_lock_revoke_anon.sql:96-98` deliberately left `authenticated` grant in place because RLS policies invoke these via `USING is_org_member(...)`. PostgreSQL evaluates the function with the caller's `auth.uid()`, so the function is always called for the requesting user — directly RPCing it just tells the caller whether they are a member of an org id (information they could derive from RLS anyway). Low practical risk; the advisor flags it as defense-in-depth.

**M7. Mobile recovery deep-link host check still missing.**
- Evidence: `app/_layout.tsx:98`:
  ```
  if (url.includes("/auth/confirm") || url.includes("/auth/callback")) {
  ```
- Risk: substring `.includes()` against the raw URL. iOS AASA already enforces host-binding for Universal Links (only delivers `https://snapquote.us/auth/*` to the app), and the custom scheme `snapquotemobile://` is exclusive to this app, so practical risk is low. But Notion's [2026-05-09 — Mobile security hardening (Audit 8 H7, H8, M9, M10)] claims H8 added a host check; I cannot find it at HEAD.
- Cross-flag: Audit 8 H8.

### LOW

**L1. `accept_invite_token` deletes expired invites inside the same call as a "this invite has expired" error.**
- Evidence: `accept_invite_token` (live `pg_proc` dump, lines analogous to `0049_fix_accept_invite_org_id_ambiguity.sql:27-32`):
  ```
  if v_invite.expires_at is not null and v_invite.expires_at <= now() then
    delete from pending_invites where id = v_invite.id;
    raise exception 'This invite link has expired.';
  end if;
  ```
  PL/pgSQL's `raise exception` rolls back the transaction, including the `DELETE`. So the expired invite is NOT deleted — the next call will repeat the same code path.
- Verified live: 10 PENDING invites in `pending_invites` table at 2026-05-11. 2 expired on 2026-05-08 21:36 (`09e3d519-...` and `369a1fc9-...`) still present. Confirms the DELETE is rolled back.
- Risk: cosmetic — the data accumulates but the function still correctly rejects expired tokens. Not a security issue.

**L2. `accept_invite_token` doesn't normalize `p_token` (trim/lowercase).**
- Evidence: `accept_invite_token` lines `where token = p_token` matches on raw input. The route handler calls with `body.token` from request JSON, which is validated only to `min(12)` (`app/api/public/invite/accept/route.ts:11-13`). A leading/trailing whitespace would cause a false negative.
- Risk: minor UX, not security.

**L3. No "sign out everywhere" UI.**
- Mobile signOut targets one device (clears local + server signOut for this refresh token). There's no UI to sign out all devices except account deletion.
- This is consistent with most consumer SaaS but worth flagging — a user who suspects compromise has no fast remediation other than deleting the account.

**L4. Mobile `_layout.tsx` recovery deep-link does verifyOtp without checking which session it replaces.**
- Evidence: `app/_layout.tsx:99-117`. If user A is logged in on the device and clicks user B's recovery email (e.g. cross-account scenario from shared family inbox), the verifyOtp succeeds and replaces user A's session with user B's. Browsers / web do the same thing. Low risk, expected behavior — but worth noting that "the device session changes identity silently" is non-obvious.

---

## Section 5 — Cross-cutting flags

- **Audit 2 (billing):** `get_org_credit_row` SECURITY DEFINER + service_role bypass at `supabase/migrations/20260509164919_fix_get_org_credit_row_service_role_bypass.sql` is verified live (`auth.role() <> 'service_role'` guards the membership check). C-12 fix is intact.
- **Audit 8 (security & privacy):**
  - H1 (HS256 removal): verified live in `lib/auth/verifyJWT.ts:131-195` — no HS256 fallback path exists.
  - H2 (issuer pinning): verified live at `lib/auth/verifyJWT.ts:149`.
  - H3 (timing-safe bearer): verified live at `lib/auth/timingSafeBearer.ts:40-49`.
  - H5 (recovery-only reset on web): verified live at `app/(public)/reset-password/page.tsx:21-58` AND `app/auth/confirm/route.ts:72-80`.
  - H7 (mobile SecureStore): **NOT IN HEAD** — see H1 above.
  - H8 (mobile AASA / deep-link host check): NOT IN HEAD as advertised — see M7 above.
  - M6 (forgot-password email+IP rate limit): verified live at `app/api/public/auth/forgot-password/route.ts:28-35`.
- **Audit 12 (notifications):** mobile signOut deletes per-device `push_tokens` row at `lib/auth.tsx:316-321`. Defaulting to per-device-id scope (not user-wide) is correct — preserves notifications on user's other devices.

---

## Section 6 — Live Data Snapshot (2026-05-11)

```
auth.users:
  total                       = 96
  email                       = 95
  google                      = 0
  apple                       = 1
  unconfirmed_email_users     = 0
  last_sign_in_at >= 14d      = 15

auth.sessions:
  active                      = 39
  distinct users              = 35
  oldest session              = 2026-03-18 21:14:28
  newest session              = 2026-05-11 16:22:07
  refreshed in last 24h       = 6
  refreshed in last 7d        = 7
  >3 sessions per user        = 0

pending_invites:
  total PENDING (last 10)     = 10 (all token-only, email NULL)
  expired but still present   = 2 (created 2026-05-01, expired 2026-05-08)

auth.audit_log_entries last 14d = 0 (audit log not capturing; Supabase Pro feature?)

Sentry unresolved issues (full search)  = 1 (unrelated url.parse deprecation)
Sentry auth-related issues last 14d     = 0
```

---

## Section 7 — Stale Notion / docs entries flagged

These pages claim work that does NOT exist at HEAD (do NOT edit them per lane rule — flag for Murdoch):

1. **[2026-05-09] Mobile security hardening (Audit 8 H7, H8, M9, M10)** — claims SecureStore migration and AASA host check shipped. Neither is in HEAD. Notion ID: `35b32498-a1cb-8153-82f9-f290b2e7b55a`.
2. **Pending Work — "Mobile session storage. Wrap Supabase JS storage in expo-secure-store"** — still marked pending but Notion's 2026-05-09 fixed-list (above) implied it was done. Pending Work is consistent with live state; the fixed-list entry is the stale one.
3. **Architecture & Stack — "Tokens-in-URL-fragment leak: lib/utils/authBrowser.ts"** — still accurate, still present at HEAD (H3).

---

## Section 8 — Out-of-scope flags

- Supabase Auth provider config (GoTrue project settings, Apple Service ID + Key ID rotation date) couldn't be read via MCP. Confirm in Studio dashboard.
- Leaked-password protection — Supabase project setting toggle, not a code change.
- Sentry breadcrumb URL scrubbing rules — need to verify whether `#access_token=` substrings in the Stripe-return URL are auto-scrubbed by Sentry's default `denylist_urls`. If not, every mobile→web open is leaking refresh tokens to Sentry.

---

## Section 9 — Recommended to-dos (priority order)

These are observations only. Do NOT fix in this audit.

1. **H1 ship mobile SecureStore migration** with AsyncStorage→SecureStore copy + delete + supabase-js storage adapter wrapping SecureStore. Match the design Notion's 2026-05-09 entry described but never landed.
2. **H2 add mobile reset-password recovery gate** — server-side equivalent: when the recovery deep link fires `verifyOtp`, mark the user_metadata with `recovery_session: true`, then check that in mobile reset-password screen.
3. **H3 stop putting refresh_token in URL fragments** — pass a short-lived single-use exchange token instead (mint via a `/api/app/auth/web-exchange` endpoint that returns a one-time code; web's auth callback exchanges that code for a session).
4. **H4 surface mobile signOut failures** — Sentry capture + retry on next foreground.
5. **H5 ship Apple nonce binding** on mobile (hashed nonce → `signInAsync`; raw nonce → `signInWithIdToken`).
6. **M1 enable leaked-password protection** in Supabase Studio.
7. **M2 align password minimums** at ≥ 8 chars across web + mobile + Supabase project setting.
8. **M3 add per-IP rate limit on /api/public/auth/bootstrap.**

---

*End of audit-1-auth-session-2026-05-11.md*
