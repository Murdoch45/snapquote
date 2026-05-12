# Build 19 TestFlight findings — live audit (2026-05-11)

Read-only audit of the 6 bugs Murdoch surfaced after installing Build 19 via TestFlight on the evening of 2026-05-11. No code changes. Per-finding root cause, recommended fix, tradeoffs, and Build 20 prioritization.

**Repos at audit time:**
- Web: `C:\Users\murdo\SnapQuote` — origin/main `f313cc6` ("Audit 12 fix pass — web bundle")
- Mobile: `C:\Users\murdo\SnapQuote-mobile` — origin/main `a9ed62d` (Build 19 was cut from this exact commit)

**AASA (live, fetched from production):**
```json
{"applinks":{"apps":[],"details":[{"appID":"U58KVR8LTA.com.murdochmarcum.snapquote","paths":["/invite/*","/auth/callback","/auth/callback?*","/auth/confirm","/auth/confirm?*","/stripe-return","/stripe-return?*"]}]}}
```
Source file: [`app/.well-known/apple-app-site-association/route.ts:11-20`](app/.well-known/apple-app-site-association/route.ts)

**Sentry (last 3h at audit time):**
- Mobile project (`snapquote-mobile`): only [SNAPQUOTE-MOBILE-H](https://snapquote.sentry.io/issues/SNAPQUOTE-MOBILE-H) "TypeError: Network request failed" — 41 events / 3 users, first seen 4 days ago. NOT specific to Murdoch's testing window today; preexisting background network noise.
- Web project (`snapquote-web`): [SNAPQUOTE-WEB-D](https://snapquote.sentry.io/issues/SNAPQUOTE-WEB-D) "AuthApiError: Invalid Refresh Token" on `middleware GET` (1 event, 24 min before audit start — coincides with Murdoch's test window), [SNAPQUOTE-WEB-E](https://snapquote.sentry.io/issues/SNAPQUOTE-WEB-E) "Resend sendEmail timed out after 8000ms" on `POST /api/public/auth/bootstrap` (1 event, 23 min before audit start).
- **No JS-level uncaught exceptions or React Native native crashes appeared in either project for the test window.** The "app crashes" Murdoch reported (see PW-B19-6) is almost certainly NOT a process-level crash — it is the `+not-found.tsx` "Not Found" screen rendering, which the user perceives as a broken/crashed state. This matters for fix scoping.

---

## PW-B19-1 — Estimate send blocked when customer has no phone, even for email-only delivery

### Root cause (live-grounded)

The send-quote validation is wired correctly **per-channel** at every layer (web client, web API, mobile client). The bug is upstream: the user's persisted delivery preference (`contractor_profile.estimate_send_text`) initializes `prefs.sendText = true`. When the contractor opens a lead with no `customer_phone`, the SMS toggle is rendered as **disabled** but the underlying boolean state remains `true`. On send, the per-channel guard fires with the misleading message even though the user couldn't have toggled SMS off through the UI.

Layer-by-layer evidence:

1. **Mobile composer initializes `prefs.sendText` from saved contractor preference** — [components/quotes/EstimateComposer.tsx:191-194](https://github.com/Murdoch45/snapquote-mobile/blob/main/components/quotes/EstimateComposer.tsx):
   ```ts
   const prefEmail = data.estimate_send_email === true;
   const prefText = data.estimate_send_text === true;
   if (prefEmail || prefText) {
     setPrefs({ sendEmail: prefEmail, sendText: prefText });
   }
   ```

2. **SMS toggle is disabled when no customer_phone** but does NOT mutate `prefs.sendText` — [components/quotes/EstimateComposer.tsx:483-490](https://github.com/Murdoch45/snapquote-mobile/blob/main/components/quotes/EstimateComposer.tsx):
   ```tsx
   <Switch
     accessibilityState={{ checked: prefs.sendText, disabled: !lead.customer_phone }}
     disabled={!lead.customer_phone}
     onValueChange={togglePrefText}
     value={prefs.sendText}
   />
   ```
   `disabled={!lead.customer_phone}` prevents user clicks. `prefs.sendText` is `true` and unmoved. UI shows a disabled-but-checked switch.

3. **Send-handler validation throws the user-visible error** — [components/quotes/EstimateComposer.tsx:267-270](https://github.com/Murdoch45/snapquote-mobile/blob/main/components/quotes/EstimateComposer.tsx):
   ```ts
   if (prefs.sendText && !lead.customer_phone) {
     setError("No customer phone number available on this lead.");
     return;
   }
   ```
   Triggers because `prefs.sendText === true` even though the user never enabled it and cannot disable it through the UI.

4. **Same shape on web** — [components/QuoteComposer.tsx:269-272](https://github.com/Murdoch45/snapquote/blob/main/components/QuoteComposer.tsx) and the disabled toggle at [:498-505](https://github.com/Murdoch45/snapquote/blob/main/components/QuoteComposer.tsx). Web also pulls saved prefs from `estimate_send_email/text`; same trap.

5. **Server-side guard exists too** — [app/api/app/quote/send/route.ts:80-81](https://github.com/Murdoch45/snapquote/blob/main/app/api/app/quote/send/route.ts):
   ```ts
   if (body.sendText && !lead.customer_phone) {
     return NextResponse.json({ error: "Customer phone is missing for text delivery." }, { status: 400 });
   }
   ```
   This is correct defense-in-depth. Clients should never POST `sendText=true` when phone is missing, so this should never fire post-fix.

6. **Database column shape** — [supabase/migrations/0001_init.sql:74-75](https://github.com/Murdoch45/snapquote/blob/main/supabase/migrations/0001_init.sql): `customer_phone text` and `customer_email text` are both nullable. The "no phone" condition is `lead.customer_phone === null`, not empty-string.

### Why it's happening

The toggle's `disabled` attribute prevents user interaction with the control, but it does not reach back into state. A standard React anti-pattern: rendering "you can't toggle this off because no phone" is purely cosmetic when the state behind it stays at its initial value. The send-time guard then catches a condition the user genuinely cannot fix from the UI.

### Recommended fix

**Mobile** — at [components/quotes/EstimateComposer.tsx:256-270](https://github.com/Murdoch45/snapquote-mobile/blob/main/components/quotes/EstimateComposer.tsx), replace the per-channel preconditions with effective-channel coercion at send time:

```ts
const handleSend = async () => {
  setError(null);

  const effectiveSendEmail = prefs.sendEmail && !!lead.customer_email;
  const effectiveSendText  = prefs.sendText  && !!lead.customer_phone;

  if (!effectiveSendEmail && !effectiveSendText) {
    setError("This customer didn't provide a phone or email. Add one before sending.");
    return;
  }
  // ...then pass effectiveSendEmail / effectiveSendText to sendQuote()
};
```

Then at [:299-300](https://github.com/Murdoch45/snapquote-mobile/blob/main/components/quotes/EstimateComposer.tsx) pass `effectiveSendEmail`, `effectiveSendText` into `sendQuote(...)`. Also use `effectiveSend*` to compute `channelBits` at [:303-305](https://github.com/Murdoch45/snapquote-mobile/blob/main/components/quotes/EstimateComposer.tsx) so the success toast reflects what was actually sent.

**Web** — mirror the same fix at [components/QuoteComposer.tsx:260-272](https://github.com/Murdoch45/snapquote/blob/main/components/QuoteComposer.tsx).

**Server-side guards stay as-is** ([app/api/app/quote/send/route.ts:77-82](https://github.com/Murdoch45/snapquote/blob/main/app/api/app/quote/send/route.ts)) — they're correct defense in depth and never fire post-fix.

### Tradeoffs / open questions for Murdoch

- **What if BOTH phone AND email are absent?** The proposed code path gives "Add one before sending." The lead can't be quoted at all in that case. The contractor's option is to call `editLeadContact` (mobile/web add-phone/add-email flow). Both repos already let owners add a phone/email manually — confirm flow works for phone-less leads end-to-end.
- **Should the disabled toggle ALSO be visually flipped off (not just disabled-but-checked)?** That's a small UX clarification — render the switch as `checked={prefs.sendText && !!lead.customer_phone}` so the visual state matches the effective state. Decoupling display from preference. One line at [:490](https://github.com/Murdoch45/snapquote-mobile/blob/main/components/quotes/EstimateComposer.tsx). Web equivalent at [:500](https://github.com/Murdoch45/snapquote/blob/main/components/QuoteComposer.tsx).
- **Should the persisted preference be touched?** No. The contractor's saved "always send text" preference is correct for leads that DO have a phone. Don't write `estimate_send_text=false` to disk on send — that would disable SMS for all future leads after a single phone-less customer. Keep the persisted preference; coerce only at send time.

### Cross-flags

- Same bug shape exists on web (`QuoteComposer.tsx`) and mobile (`EstimateComposer.tsx`). Two-line equivalent change in each. Same fix surface, no shared library to update.
- No dependency on PW-B19-2/3/4/5/6.

### Complexity

**Small.** Per-side change is ~15 lines: introduce two derived booleans, replace two validations with one combined check, pipe the effective values into `sendQuote()`. No new imports, no shared util needed. Unit tests on send handler should pass through unchanged; manual TestFlight verify with a phone-less lead is the live check.

---

## PW-B19-2 — Locked lead detail shows "Address hidden" instead of city/state/zip

### Root cause (live-grounded)

The mobile detail page does not consult `job_city` / `job_state` / `job_zip` on the locked branch. It computes `displayAddress` from `address_full` only, which is `NULL` for locked leads under the `leads_safe` view.

Layer-by-layer evidence:

1. **`leads_safe` view returns city/state/zip unconditionally; PII-only columns are NULL when locked** — [supabase/migrations/20260509000001_audit8_pii_gating_revoke_anon_analytics_and_safe_views.sql:343-345 + 372-382](https://github.com/Murdoch45/snapquote/blob/main/supabase/migrations/20260509000001_audit8_pii_gating_revoke_anon_analytics_and_safe_views.sql):
   ```sql
   l.job_city,
   l.job_state,
   l.job_zip,
   ...
   CASE WHEN u.lead_id IS NOT NULL THEN l.address_full END AS address_full,
   ```
   `job_city`/`job_state`/`job_zip` are projected directly off `leads` — never nulled out. PII (`address_full`, `customer_name`, `customer_phone`, `customer_email`, `lat`, `lng`, `description`) is the only thing the view gates.

2. **Mobile detail screen renders `displayAddress` from `address_full` only** — [app/(tabs)/leads/[id].tsx:62-72 + 278-280 + 293-295](https://github.com/Murdoch45/snapquote-mobile/blob/main/app/(tabs)/leads/[id].tsx):
   ```ts
   function getVisibleAddress(address: string | null | undefined): string {
     if (!address) return "Address hidden";
     // ...
   }
   // ...
   const displayAddress = isLocked
     ? getVisibleAddress(lead.address_full)   // address_full is NULL when locked
     : lead.address_full;
   // ...
   <Text style={styles.headerAddress}>{displayAddress}</Text>
   ```
   On a locked lead, `lead.address_full === null` → `getVisibleAddress(null) === "Address hidden"`.

3. **Mobile list screen renders city+state correctly** — [components/leads/LeadCard.tsx:40-44](https://github.com/Murdoch45/snapquote-mobile/blob/main/components/leads/LeadCard.tsx):
   ```ts
   if (lead.job_city && lead.job_state) {
     return `${lead.job_city}, ${lead.job_state}`;
   }
   return getAddressShort(lead.address_full);
   ```
   This is why Murdoch sees "Culver City, California" on the list view but "Address hidden" on the detail view. Same data, different formatter.

4. **Web detail page already does this correctly** — [app/app/leads/[id]/page.tsx:129-164](https://github.com/Murdoch45/snapquote/blob/main/app/app/leads/[id]/page.tsx) uses [lib/leadPresentation.ts:52-67](https://github.com/Murdoch45/snapquote/blob/main/lib/leadPresentation.ts) `composeLocality({jobCity, jobState, jobZip, addressFull})`:
   ```ts
   const lockedLocality = composeLocality({
     jobCity: (lead.job_city as string | null) ?? null,
     jobState: (lead.job_state as string | null) ?? null,
     jobZip: (lead.job_zip as string | null) ?? null,
     addressFull: (lead.address_full as string | null) ?? null
   });
   // ...
   const displayAddress = isLocked
     ? lockedLocality
     : ((lead.address_full as string | null) ?? lockedLocality);
   ```
   `composeLocality` returns `"City, State Zip"` from `job_city/job_state/job_zip` when present, with `getAddressParts(addressFull).locality` as a fallback.

5. **Mobile Lead type has `job_zip`; mobile detail query selects `*` so `job_zip` is available on the row** — [lib/types.ts:94-96](https://github.com/Murdoch45/snapquote-mobile/blob/main/lib/types.ts) + [lib/api/leads.ts:186-189](https://github.com/Murdoch45/snapquote-mobile/blob/main/lib/api/leads.ts). (The list-column projection `LEAD_LIST_COLUMNS` at [lib/api/leads.ts:70](https://github.com/Murdoch45/snapquote-mobile/blob/main/lib/api/leads.ts) does NOT include `job_zip`, but that's only relevant for the list view; detail uses `select("*")`.)

### Why it's happening

This regression rode in with Audit 8 C2 (PII gating via `leads_safe` view). Before the view, `address_full` was always present (locked leads showed the full string regardless of unlock state — Audit 8's whole reason for being). After the view, locked → null. Mobile detail's `getVisibleAddress` was patched to gracefully return "Address hidden" for null (see comment at [app/(tabs)/leads/[id].tsx:63-67](https://github.com/Murdoch45/snapquote-mobile/blob/main/app/(tabs)/leads/[id].tsx)) — but the patch made the placeholder ship instead of using the still-available city/state/zip. Web detail got the proper port (`composeLocality`), mobile detail did not.

The mobile `docs/updates-log.md:418` post-Audit-8 verification checklist explicitly calls this regression class out: "locked cards show the expected non-PII fields (city/state/zip, status, services...)" — a checklist that wasn't followed for the detail view.

### Recommended fix

**Port `composeLocality` to mobile and use it on the detail screen.** Two places to change:

1. Add a new file `lib/leadPresentation.ts` in the mobile repo (or extend `lib/utils/format.ts`) with the same `composeLocality` function as the web port:
   ```ts
   export function composeLocality(args: {
     jobCity?: string | null;
     jobState?: string | null;
     jobZip?: string | null;
     addressFull?: string | null;
   }): string {
     const city = args.jobCity?.trim() || null;
     const state = args.jobState?.trim() || null;
     const zip = args.jobZip?.trim() || null;
     if (city && state) return zip ? `${city}, ${state} ${zip}` : `${city}, ${state}`;
     if (city) return zip ? `${city} ${zip}` : city;
     if (state) return zip ? `${state} ${zip}` : state;
     // Fallback for legacy rows without job_city — strip street from address_full
     return getAddressParts(args.addressFull ?? null).locality;
   }
   ```

2. Replace [app/(tabs)/leads/[id].tsx:278-280](https://github.com/Murdoch45/snapquote-mobile/blob/main/app/(tabs)/leads/[id].tsx):
   ```ts
   const displayAddress = isLocked
     ? composeLocality({
         jobCity: lead.job_city,
         jobState: lead.job_state,
         jobZip: lead.job_zip,
         addressFull: lead.address_full
       })
     : lead.address_full;
   ```

3. The local `getVisibleAddress` helper at [:62-72](https://github.com/Murdoch45/snapquote-mobile/blob/main/app/(tabs)/leads/[id].tsx) becomes dead code (the body of `composeLocality`'s fallback uses `getAddressParts` instead). Either delete it or leave it as a backstop — deleting is cleaner.

### Tradeoffs / open questions for Murdoch

- **`getVisibleAddress` is only used here.** Deleting is safe.
- **Web fix is already in place.** No web change needed.
- **List view's `LEAD_LIST_COLUMNS` doesn't request `job_zip`.** If consistency with the list ("City, State" without zip) is preferred over the detail showing "City, State Zip", drop `jobZip` from the `composeLocality` args. Murdoch's reported expectation in the prompt was `${city}, ${state} ${zip}` — so include `job_zip` for the detail. If the list should also show zip, add `job_zip` to `LEAD_LIST_COLUMNS` at [lib/api/leads.ts:70](https://github.com/Murdoch45/snapquote-mobile/blob/main/lib/api/leads.ts) and tweak `LeadCard.tsx:41` to render it.
- **The fix is mobile-only.** Web doesn't need a touch — confirmed at [app/app/leads/[id]/page.tsx:162-164](https://github.com/Murdoch45/snapquote/blob/main/app/app/leads/[id]/page.tsx).

### Cross-flags

- Closes the regression class documented in mobile [`docs/updates-log.md:411-423`](docs/updates-log.md) (post-Audit-8 PII-gating live-verification checklist).
- No dependency on other findings.

### Complexity

**Small.** New helper (~15 lines) + 5-line edit in the detail screen + optional 1-line deletion. Live verify on TestFlight with a known locked lead: detail header shows `${city}, ${state} ${zip}` and `LeadCard` (list) shows `${city}, ${state}` consistently. The `address_full` fallback inside `composeLocality` keeps legacy rows safe.

---

## PW-B19-3 — iOS app icon flips between light and dark with system theme

### Root cause (live-grounded)

Working as configured. Murdoch wants a different configuration.

Current state at [app.json:20-25](https://github.com/Murdoch45/snapquote-mobile/blob/main/app.json):
```json
"icon": {
  "light": "./assets/images/icon.png",
  "dark": "./assets/images/icon-dark.png",
  "tinted": "./assets/images/icon.png",
  "backgroundColor": "#FFFFFF"
}
```

iOS 18+ honors three slots per app:
- `light` — icon shown when device is in Light Mode (white-bg `icon.png`).
- `dark` — icon shown when device is in Dark Mode (`icon-dark.png` — the dark variant Murdoch and Claude Design produced for Build 19, intended for the notification banner).
- `tinted` — icon shown when "Tinted icons" is enabled in Settings (mapped to the light `icon.png`).

Build 19 added the dark variant (commit `efc0ba9` — "feat(mobile): add iOS dark-mode app icon variant for push notification banners"). iOS applies the same `ios.icon.dark` to **both** the home screen icon and the notification banner icon when in Dark Mode — there is no separate notification-banner slot. So the white-bg icon shows in Light Mode (home + banner), and the dark variant shows in Dark Mode (home + banner). That's what Murdoch is seeing.

Murdoch's stated preference is "a single white-bg icon used everywhere, in both modes." That requires pointing `ios.icon.dark` (and ideally also `tinted`) at the white-bg `icon.png`.

### Recommended fix

Single-line edit at [app.json:22](https://github.com/Murdoch45/snapquote-mobile/blob/main/app.json):
```diff
- "dark": "./assets/images/icon-dark.png",
+ "dark": "./assets/images/icon.png",
```

`tinted` already points at `./assets/images/icon.png` ([app.json:23](https://github.com/Murdoch45/snapquote-mobile/blob/main/app.json)), no change.

Keep `./assets/images/icon-dark.png` on disk and committed (Build 19 already shipped it, asset has been through Build review). Easy to revert if Murdoch revisits notification-banner branding later.

### What iOS does post-revert

With `light`, `dark`, and `tinted` all pointing at `./assets/images/icon.png`:
- **Home screen icon, Light Mode**: white-bg icon.
- **Home screen icon, Dark Mode**: same white-bg icon. iOS does NOT auto-darken or auto-invert.
- **Tinted mode** (Settings → Home Screen → Tinted): same white-bg icon used as the source for iOS tinting.
- **Notification banner, Light Mode**: white-bg icon.
- **Notification banner, Dark Mode**: white-bg icon (iOS does not composite or recolor — the asset is used verbatim).

### Tradeoffs / open questions for Murdoch

- **No edge case** — the white-bg icon may look harsh on a Dark Mode notification banner stack (visually "punches out" against the black background). Murdoch already saw this on Builds 1–18 and confirmed he prefers it that way. Documented preference, not a bug.
- **EAS prebuild** picks up `app.json` on every build, so the change ships with the next production build (Build 20) without any other glue. No native module touch.
- **`expo-notifications` plugin icon** at [app.json:170-173](https://github.com/Murdoch45/snapquote-mobile/blob/main/app.json) already references `./assets/images/icon.png` (light variant). No change needed there; that controls the Android notification icon.

### Cross-flags

- The dark variant landed in Build 19 (commit `efc0ba9`). This is a quick revert of half of that change. The asset file stays on disk so a future revival is trivial.
- No dependency on other findings.

### Complexity

**One-line.** Edit a single string in `app.json`. Ships with Build 20.

---

## PW-B19-5 — Apple Sign In on web redirects to app and shows "Page not found"

### Root cause (live-grounded)

The AASA file claims `/auth/callback` for the iOS app. When the user has the app installed, iOS intercepts the Supabase Apple OAuth callback URL **before** the browser can process it, hands the URL to the mobile app, and Expo Router has no route file for `/auth/callback` → renders [app/+not-found.tsx](https://github.com/Murdoch45/snapquote-mobile/blob/main/app/+not-found.tsx) which displays "Not Found" via [components/ScreenPlaceholder.tsx](https://github.com/Murdoch45/snapquote-mobile/blob/main/components/ScreenPlaceholder.tsx).

The deep-link handler in [app/_layout.tsx:147-220](https://github.com/Murdoch45/snapquote-mobile/blob/main/app/_layout.tsx) DOES catch `/auth/callback` and call `exchangeCodeForSession(code)`, so the session IS established — but the handler only navigates away from `+not-found.tsx` if `next === "/reset-password"` ([_layout.tsx:200-202](https://github.com/Murdoch45/snapquote-mobile/blob/main/app/_layout.tsx)), which is false for OAuth (Apple sets `next=/app`). The user is left stranded on the +not-found screen with a valid session.

Layer-by-layer evidence:

1. **AASA claims `/auth/callback`** — [app/.well-known/apple-app-site-association/route.ts:13-15](https://github.com/Murdoch45/snapquote/blob/main/app/.well-known/apple-app-site-association/route.ts) (live JSON confirmed against snapquote.us above).

2. **Web Apple OAuth `redirectTo` is `/auth/callback`** — [components/auth/LoginForm.tsx:92-102](https://github.com/Murdoch45/snapquote/blob/main/components/auth/LoginForm.tsx):
   ```ts
   await supabase.auth.signInWithOAuth({
     provider,  // "apple" or "google"
     options: {
       redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(inviteAcceptPath ?? "/app")}`
     }
   });
   ```
   Same shape on signup at [components/auth/SignupForm.tsx:119-126](https://github.com/Murdoch45/snapquote/blob/main/components/auth/SignupForm.tsx). On success Apple/Supabase returns the browser to `https://snapquote.us/auth/callback?code=…&next=/app`.

3. **iOS Universal Links rules**: when an HTTPS URL matches an AASA-declared path and the matching app is installed, iOS opens the app and delivers the URL via the system. The browser/Safari does not get to process the URL. There is no way for the web app to "race" iOS for the redirect — iOS gets first refusal.

4. **Mobile app has no route file at `app/auth/callback.tsx`** — confirmed via Glob on `app/**/*.tsx`. The closest is the `+not-found.tsx` fallback at [app/+not-found.tsx](https://github.com/Murdoch45/snapquote-mobile/blob/main/app/+not-found.tsx) which renders `<ScreenPlaceholder title="Not Found" />`.

5. **Deep-link handler runs `exchangeCodeForSession` but doesn't navigate** — [app/_layout.tsx:178-205](https://github.com/Murdoch45/snapquote-mobile/blob/main/app/_layout.tsx):
   ```ts
   if (url.includes("/auth/confirm") || url.includes("/auth/callback")) {
     try {
       const parsed = new URL(url);
       const tokenHash = parsed.searchParams.get("token_hash");
       const type = parsed.searchParams.get("type") as ... | null;
       const code = parsed.searchParams.get("code");
       const next = parsed.searchParams.get("next");

       if (tokenHash && type) {
         const { data } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
         if (type === "recovery" && data.user?.id) {
           await markRecoverySession(data.user.id);
         }
       } else if (code) {
         await supabase.auth.exchangeCodeForSession(code);
       }

       if (next === "/reset-password") {
         router.replace("/(auth)/reset-password");
       }
     } catch { /* swallow */ }
   }
   ```
   The session IS established (line 197). The navigation gate at line 200 only fires for password-reset URLs. For Apple OAuth, `next` is `/app` (per LoginForm.tsx:99) — no `router.replace`. Even if the navigation gate fired, the user is on `+not-found.tsx` until that point because Expo Router has already attempted to route to `/auth/callback`.

6. **Sentry confirms no native crash** in the test window for the mobile project (per the Sentry section above). The "Page not found" is exactly what Expo Router renders for `+not-found.tsx`.

### Why it's happening

Two stacked issues:

- **AASA over-claims paths the app doesn't route**. AASA was added in commit `ad5adf4` (Audit 8 H8 followup) and tightened in `b78a688` to prevent UL hijack of public-slug routes — but the AASA still claims `/auth/callback` for the app. The intent was probably to support mobile-originating OAuth flows (where the mobile app starts the Apple flow and gets the callback). The unintended side-effect is hijacking the web Apple flow when the app happens to be installed.
- **No Expo Router route file at `app/auth/callback.tsx`**. Even if Murdoch wants iOS to handle `/auth/callback` (to make web-originating OAuth work), there has to be a route file that completes the exchange and routes the user somewhere useful (e.g., `/(tabs)`).

### Recommended fix (Murdoch product decision required)

**Decision: do we want web-originated Apple/Google sign-in to "deeplink into the app" or stay in Safari?**

#### Option A — Stay in Safari (web → web, simpler)

Remove `/auth/callback` and `/auth/callback?*` from the AASA paths list at [app/.well-known/apple-app-site-association/route.ts:14-15](https://github.com/Murdoch45/snapquote/blob/main/app/.well-known/apple-app-site-association/route.ts). The PKCE callback handler at [app/auth/callback/route.ts](https://github.com/Murdoch45/snapquote/blob/main/app/auth/callback/route.ts) on web completes the exchange and the user lands on `/app` in Safari. Native app sessions are independent — Murdoch already has a working mobile Apple flow via `AppleAuthentication.signInAsync` (no web bounce).

Pros: simplest. Web auth stays on web. Mobile auth was never broken in the first place. No router work.

Cons: a user who is signed-in-on-web won't have their mobile session automatically established. They'd have to sign in again in the mobile app via the native button. **This was the status quo before AASA was added.**

#### Option B — Make the app handle `/auth/callback` correctly

Add `app/auth/callback.tsx` as an Expo Router route that:
1. Reads `code` and `next` from the URL.
2. Calls `supabase.auth.exchangeCodeForSession(code)`.
3. Navigates to `/(tabs)` (or wherever `next` says, but constrained to known internal routes).
4. Renders `<LoadingScreen />` while in flight.

Remove the `/auth/callback` branch from the [`_layout.tsx:178-205`](https://github.com/Murdoch45/snapquote-mobile/blob/main/app/_layout.tsx) deep-link handler since the route file now owns it (keep the `/auth/confirm` branch — see PW-B19-6).

Pros: web → app handoff Just Works™. The contractor who signs in on snapquote.us is already signed in when they tap their TestFlight icon.

Cons: more code. The session exchange that today lives in `_layout.tsx` moves into a real screen. Requires careful testing for the cold-start and warm-start cases.

#### Recommendation

**Option A for Build 20** — fastest fix, removes the user-visible failure, keeps everything else stable. Option B can ship in a later build once Murdoch decides whether mobile-mirroring-web is a feature he wants.

If Option A: one-line removal in [`app/.well-known/apple-app-site-association/route.ts:14-15`](https://github.com/Murdoch45/snapquote/blob/main/app/.well-known/apple-app-site-association/route.ts) (delete `/auth/callback` and `/auth/callback?*` from the paths array). Also remove the `/auth/callback` intent filter on Android at [app.json:117-136](https://github.com/Murdoch45/snapquote-mobile/blob/main/app.json) for consistency (Android has the same problem class via its `autoVerify` app links).

### Tradeoffs / open questions for Murdoch

- **What happens for users WITHOUT the app installed?** Web flow works correctly today. Live verifiable: open snapquote.us in a private window on a device without the app, sign in with Apple, you land on `/app`. This is the path most production users take and it is unaffected by either option.
- **Is this a regression from a recent change?** Yes — commit `ad5adf4` added AASA on 2026-05-08-ish (Audit 8 H8 followup). Before that, AASA didn't exist, and `/auth/callback` always stayed in Safari. The hijack regression rode in with the AASA addition.
- **Same hijack risk on `/stripe-return`?** The deep-link handler at [_layout.tsx:171-173](https://github.com/Murdoch45/snapquote-mobile/blob/main/app/_layout.tsx) handles `/stripe-return` by writing to AsyncStorage — but again no Expo Router route exists. If Murdoch tests Stripe Checkout from the web while the app is installed, expect the same "Not Found" screen. Flag for live verification.

### Cross-flags

- **Shares the same root structural problem as PW-B19-6** (universal link hits the app but Expo Router has no matching screen). The two findings are different URL surfaces but the fix shape — remove the AASA path, OR create a real Expo Router route — is the same kind of decision.

### Complexity

**Option A**: one-line (remove two entries from AASA paths array). **Option B**: medium (new route file, navigation refactor, careful warm-start testing). Recommend Option A for Build 20.

---

## PW-B19-6 — Forgot password link crashes app, then hangs on "Loading SnapQuote"

### Root cause (live-grounded)

Same structural class as PW-B19-5: AASA claims `/auth/confirm`, the password-reset email points there, iOS routes the URL to the app on tap, and Expo Router has no route file for `/auth/confirm` so the user sees `+not-found.tsx` ("Not Found"). The deep-link handler in `_layout.tsx` DOES call `verifyOtp` and DOES route to `/(auth)/reset-password` (because `next=/reset-password` is set by the email URL), but the user perceives the brief "Not Found" flash as a "crash."

On the **second tap** the same email URL is re-used; Supabase has already consumed the token, so `verifyOtp` returns an error, the catch at [_layout.tsx:203-205](https://github.com/Murdoch45/snapquote-mobile/blob/main/app/_layout.tsx) swallows it silently, **no `markRecoverySession` is set**, and `router.replace("/(auth)/reset-password")` still fires (line 200-202 — the `next === "/reset-password"` branch runs regardless of OTP failure). The `reset-password` screen mounts, calls `isRecoverySessionAuthorized(sessionUserId)` ([app/(auth)/reset-password.tsx:33-53](https://github.com/Murdoch45/snapquote-mobile/blob/main/app/(auth)/reset-password.tsx)), the marker is missing (because verifyOtp threw, never marked it), `gateStatus` flips to `"expired"` ([:42](https://github.com/Murdoch45/snapquote-mobile/blob/main/app/(auth)/reset-password.tsx)).

What about the "Loading SnapQuote" hang? That message comes from [components/LoadingScreen.tsx:9](https://github.com/Murdoch45/snapquote-mobile/blob/main/components/LoadingScreen.tsx) (`label = "Loading SnapQuote"`). It's rendered by `RootNavigator` at [_layout.tsx:388-389](https://github.com/Murdoch45/snapquote-mobile/blob/main/app/_layout.tsx) when `isLoading || isResolvingInvite` is true. The most plausible scenario for the second tap:

- On second tap, `verifyOtp` throws → handler swallows it. `RootNavigator` is still running its auth-resolution loop. If session is in a transitional state from the first tap (verifyOtp set a session, but the AuthProvider's session subscription hasn't fully resolved orgId), `isLoading || isResolvingInvite` stays true → LoadingScreen renders.
- Alternatively: AuthProvider's session subscription is hung on a stale realtime channel left over from the first tap's stranded `+not-found.tsx` state. Without a Sentry stack trace it's hard to be definitive — there's no JS-level crash event in the 3-hour Sentry window.

Layer-by-layer evidence:

1. **Reset email URL** — [app/api/public/auth/forgot-password/route.ts:51](https://github.com/Murdoch45/snapquote/blob/main/app/api/public/auth/forgot-password/route.ts):
   ```ts
   const resetUrl = `${appUrl}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=recovery&next=/reset-password`;
   ```
   `appUrl` is `https://snapquote.us` in production.

2. **AASA claims `/auth/confirm`** — same source as PW-B19-5: [app/.well-known/apple-app-site-association/route.ts:16-17](https://github.com/Murdoch45/snapquote/blob/main/app/.well-known/apple-app-site-association/route.ts).

3. **Mobile deep-link handler** — [app/_layout.tsx:178-205](https://github.com/Murdoch45/snapquote-mobile/blob/main/app/_layout.tsx) (full block above). Correctly handles `verifyOtp({token_hash, type: "recovery"})`, marks the recovery session via [`lib/auth/recoverySession.ts:38-41`](https://github.com/Murdoch45/snapquote-mobile/blob/main/lib/auth/recoverySession.ts), then `router.replace("/(auth)/reset-password")`. Single-tap flow is functionally complete.

4. **No `app/auth/confirm.tsx` route file** — same problem as PW-B19-5. Expo Router shows `+not-found.tsx` (Not Found) until `router.replace` lands. There's a visible flash; on a slow network, the flash is longer because `verifyOtp` waits on the Supabase round-trip before `router.replace`.

5. **Recovery session TTL = 5 minutes** — [lib/auth/recoverySession.ts:53-67](https://github.com/Murdoch45/snapquote-mobile/blob/main/lib/auth/recoverySession.ts). The token also has its own short TTL at the Supabase project level (Murdoch's prior audits noted "5 minutes after you tap it" — see [app/(auth)/reset-password.tsx:116-117](https://github.com/Murdoch45/snapquote-mobile/blob/main/app/(auth)/reset-password.tsx)). Second-tap reuse is well past consumption.

6. **Catch swallows verifyOtp errors silently** — [_layout.tsx:203-205](https://github.com/Murdoch45/snapquote-mobile/blob/main/app/_layout.tsx) `catch { /* malformed URL or verification failed — let the web fallback handle it. */ }`. This is the M3 finding already documented in [docs/updates-log.md:2055](https://github.com/Murdoch45/snapquote/blob/main/docs/updates-log.md) and [docs/updates-log.md:2302](https://github.com/Murdoch45/snapquote/blob/main/docs/updates-log.md) — "M3 silent failure on mobile password-reset deep-link." Open from a prior audit.

### Why it's happening

Three stacked issues, in order of user-visible impact:

1. **The +not-found.tsx flash is what Murdoch is calling "the app crashed."** It's not a process crash — it's an Expo Router rendering of the "Not Found" placeholder during the window between iOS handing the URL to the app and `_layout.tsx`'s deep-link handler completing its async `verifyOtp` + `router.replace`. On a fast network this is sub-second. On a slow one or with cold-start contention, it's clearly visible.

2. **Token already consumed on the second tap.** The handler's catch swallows the error, but `router.replace("/(auth)/reset-password")` STILL fires regardless ([_layout.tsx:200-202](https://github.com/Murdoch45/snapquote-mobile/blob/main/app/_layout.tsx) — the `next === "/reset-password"` check is independent of the verifyOtp success). The reset-password screen mounts, finds no marker, shows the "expired" UI. But it lands AFTER potentially being in `isLoading` state for a stretch (because of (3)).

3. **Auth state can wedge on `isLoading` after a deep-link round-trip.** If the AuthProvider has any cross-effect with `_layout.tsx`'s deep-link handler — e.g., a session subscription that's already mid-flight, or `isResolvingInvite` from a prior pendingInviteToken — the loading screen sticks. This is the part that's hardest to nail without device-side Sentry data. The "Loading SnapQuote" hang is the symptom.

### Recommended fix

A complete fix takes a small bundle of changes:

#### A. Eliminate the +not-found flash on `/auth/confirm`

Same Option A vs Option B from PW-B19-5 applies here. **Recommended: Option B for `/auth/confirm`** because password reset has no good web fallback once the user has the app installed — the URL must work and must end in a reset-password screen with a live session. Pure-removal from AASA (Option A) would push the reset link back to Safari, which works fine, but split-brain across the OAuth case feels confusing.

**Add `app/auth/confirm.tsx` as a real Expo Router route**:

```tsx
// app/auth/confirm.tsx
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { LoadingScreen } from "@/components/LoadingScreen";
import { markRecoverySession } from "@/lib/auth/recoverySession";
import { supabase } from "@/lib/supabase";
import * as Sentry from "@sentry/react-native";

export default function AuthConfirmScreen() {
  const { token_hash, type, next } = useLocalSearchParams<{
    token_hash?: string; type?: "recovery" | "signup" | "email"; next?: string;
  }>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        if (!token_hash || !type) { setError("Invalid link."); return; }
        const { data, error } = await supabase.auth.verifyOtp({ token_hash, type });
        if (error) { setError(error.message); return; }
        if (type === "recovery" && data.user?.id) {
          await markRecoverySession(data.user.id);
        }
        router.replace(next === "/reset-password" ? "/(auth)/reset-password" : "/(tabs)");
      } catch (err) {
        Sentry.captureException(err, { tags: { source: "auth/confirm" } });
        setError("Couldn't process this link. Please request a new one.");
      }
    })();
  }, [token_hash, type, next]);

  if (error) {
    // Render a small error UI with a "Request new reset email" CTA back to /(auth)/forgot-password
    return <LoadingScreen label="Link expired" />; // or a dedicated error screen
  }
  return <LoadingScreen label="Verifying…" />;
}
```

This file:
- Lives at the URL the user lands on, so Expo Router renders THIS screen instead of `+not-found.tsx`.
- Does the OTP verification and recovery-session marking that `_layout.tsx` was doing.
- Has explicit error handling + Sentry capture (closes the M3 finding).
- Routes to `/(auth)/reset-password` on success, or back to `/(auth)/forgot-password` on failure (UI omitted for brevity).

Then **remove the `/auth/confirm` and `/auth/callback` branches from [`_layout.tsx:178-205`](https://github.com/Murdoch45/snapquote-mobile/blob/main/app/_layout.tsx)** — they're now owned by route files (if doing Option B for both `/auth/callback` and `/auth/confirm`).

#### B. Make the reset-password screen explicit when verifyOtp fails

Either route into a "Link expired" UI on second-tap (instead of letting the recovery-session marker be silently absent and just showing "expired"), OR display a toast on second tap. The "expired" state at [app/(auth)/reset-password.tsx:101-129](https://github.com/Murdoch45/snapquote-mobile/blob/main/app/(auth)/reset-password.tsx) is actually good UX — clear message, button to request a new one. The bug is that the user has to see "Loading SnapQuote" first.

#### C. Confirm the "Loading SnapQuote" hang isn't a deeper auth-resolution issue

After the route file in (A) lands, the deep-link handler in `_layout.tsx` is no longer doing any session work for these URLs. If "Loading SnapQuote" still hangs on the second tap post-fix, there's a separate issue in `AuthProvider`'s loading state machine. Live verification post-fix should test this explicitly.

### Tradeoffs / open questions for Murdoch

- **Whether to keep `/auth/confirm` in AASA at all.** The reset email URL works fine in Safari for users without the app. The "I have the app and I tapped the link" case is the failing path. Keeping AASA and adding the route file (Option B above) is the better UX for app-installed users; removing AASA (Option A) is simpler but degrades the in-app reset experience.
- **Why does the second tap "hang on Loading SnapQuote" specifically?** Best guess (no Sentry stack to confirm): AuthProvider's session-resolution is wedged because the first tap put it in a weird half-state. The route file in (A) should fully resolve this, but live verification is needed.
- **Should the route file also handle OAuth `/auth/callback`?** Yes — same shape, same fix. One small additional file `app/auth/callback.tsx` that does `exchangeCodeForSession(code)` + `router.replace("/(tabs)")`. Closes BOTH PW-B19-5 and PW-B19-6 in one structural change.

### Cross-flags

- **Shares root cause with PW-B19-5.** Both findings should be fixed by the same structural change: create real Expo Router route files for the universal-link paths the app claims via AASA. If Murdoch chooses Option A for PW-B19-5 (remove `/auth/callback` from AASA), the natural symmetric move is also remove `/auth/confirm` from AASA — but that arguably worsens password-reset UX.
- **Closes the M3 "silent failure on mobile password-reset deep-link"** documented in [docs/updates-log.md:2055 + :2302](https://github.com/Murdoch45/snapquote/blob/main/docs/updates-log.md).

### Complexity

- **Option B (recommended)**: medium. Two new route files (~25 lines each) + remove the corresponding branches from `_layout.tsx`. Requires careful cold-start vs warm-start testing on TestFlight.
- **Option A (faster but degrades UX)**: small. Two-line AASA edit, no other changes.

---

## PW-B19-4 — Solo plan invite UI visual check

### Root cause (live-grounded)

Working as designed; no bug. The plan seat limits are wired correctly server-side, but the invite buttons on mobile are NOT pre-disabled when the contractor's plan can't host any more seats — they only fail at click time with a server-side error.

Layer-by-layer evidence:

1. **Plan seat limits** — [lib/plans.ts:9-13](https://github.com/Murdoch45/snapquote/blob/main/lib/plans.ts):
   ```ts
   export const PLAN_SEAT_LIMITS: Record<OrgPlan, number> = {
     SOLO: 1,
     TEAM: 2,
     BUSINESS: 5
   };
   ```
   Matches Murdoch's expectations. (Note: the prompt mentioned a mobile equivalent; in this codebase plans live in the web repo and the mobile app delegates to the web API for any plan/seat decision.)

2. **Server-side seat gate** — [lib/teamInvites.ts:48-78](https://github.com/Murdoch45/snapquote/blob/main/lib/teamInvites.ts) `assertSeatAvailable()` throws `SeatLimitReachedError` (HTTP 409) with a message of the form:
   > Your plan has 1 seat with 1 member (1/1). Remove a member, revoke a pending invite, or upgrade your plan before sending another.

3. **Invite-link endpoint calls the gate** — [app/api/app/team/invite-link/route.ts:21-23](https://github.com/Murdoch45/snapquote/blob/main/app/api/app/team/invite-link/route.ts):
   ```ts
   await deleteExpiredPendingInvites(admin, auth.orgId);
   await assertSeatAvailable(admin, auth.orgId);
   ```

4. **Email-invite endpoint calls the gate** — [app/api/app/team/invite/route.ts:31](https://github.com/Murdoch45/snapquote/blob/main/app/api/app/team/invite/route.ts) `await assertSeatAvailable(admin, auth.orgId);`.

5. **Mobile team screen** — [app/(tabs)/more/team.tsx:148-204 + 262-288](https://github.com/Murdoch45/snapquote-mobile/blob/main/app/(tabs)/more/team.tsx). Buttons "Share via text or email" and "Copy Invite Link" are rendered for owners. They are NOT disabled based on plan. On click → `generateInviteLink()` → API returns 409 with the message → mobile catches via `toErrorMessage(error)` ([:165-176](https://github.com/Murdoch45/snapquote-mobile/blob/main/app/(tabs)/more/team.tsx)) and writes to `actionError` state at [:255-258](https://github.com/Murdoch45/snapquote-mobile/blob/main/app/(tabs)/more/team.tsx). The text appears above the invite card in red.

### Why this is "working but suboptimal"

The Solo user's invite button doesn't visually telegraph "you can't use this." Clicking it triggers a server round-trip and an error toast above the card. This is functional but feels broken to a user who taps and gets an error rather than seeing the button disabled. **No bug — UX polish opportunity.**

### Recommended fix (optional, polish only)

If Murdoch wants the better state, pre-disable the button when `members.length + pending_invites.length >= getPlanSeatLimit(plan)`. That requires the mobile team screen to know the plan and the current seat count (both already available — `profile.data.plan` and `team.data` lengths). One small derived boolean, two `disabled` props, and a small helper text under the buttons. ~10 lines.

But strictly speaking this is **not in scope for Build 20 unless Murdoch explicitly wants it.** The reported behavior is acceptable.

### Tradeoffs / open questions for Murdoch

- **Visual check 1**: "Disabled state of the share button doesn't look broken" — there is no disabled state today. Buttons are always enabled; failure manifests as an error message above. If Murdoch is OK with that, no change. If he wants a true disabled state, see polish suggestion above.
- **Visual check 2**: Team=2, Business=5. Confirmed against [lib/plans.ts:9-13](https://github.com/Murdoch45/snapquote/blob/main/lib/plans.ts). ✓

### Cross-flags

- None. Independent of other findings.

### Complexity

**One-line confirm** for the seat-limit values (no fix needed). **Small** if Murdoch wants the disabled-state polish.

---

## Build 20 prioritization

| Finding | Severity | Complexity | Recommendation | Decision needed? |
|---|---|---|---|---|
| PW-B19-1 — Estimate send blocked on phone-less leads | Revenue blocker | Small | **Ship in Build 20.** | No — fix per recommendation above |
| PW-B19-2 — Locked lead detail shows "Address hidden" | High UX bug, repeated regression | Small | **Ship in Build 20.** | No — fix per recommendation above |
| PW-B19-3 — iOS app icon dark variant flip | Polish, configuration mismatch | One-line | **Ship in Build 20.** | No — single string edit in app.json |
| PW-B19-5 — Apple SIWA on web → app "Not Found" | High UX bug, blocks web → app handoff | Small (Option A) / Medium (Option B) | **Ship Option A in Build 20**; revisit Option B post-launch | YES — Option A vs Option B (see below) |
| PW-B19-6 — Forgot password link crashes + hangs | **Launch-blocker** (users can't recover accounts) | Medium (Option B) / Small (Option A) | **Ship Option B in Build 20** (route file for /auth/confirm) | YES — see below |
| PW-B19-4 — Solo plan invite gating UI | Polish, not a bug | One-line confirm | **Defer.** Not blocking. | YES if polish wanted |

### Decisions Murdoch needs to make before Build 20 fix pass starts

1. **PW-B19-5 + PW-B19-6 strategy** (these two should be decided together):
   - **(A) AASA-removal path**: drop `/auth/callback` and `/auth/confirm` from AASA. Web auth flows stay on web; mobile keeps native sign-in. Simplest. ~2 line change. Mobile users who tap a password-reset email open Safari and finish the reset there — works, just less seamless.
   - **(B) Route-file path**: create `app/auth/callback.tsx` and `app/auth/confirm.tsx` as real Expo Router routes that complete the exchange + navigate. Best UX. Medium complexity (~50 LOC total + careful testing of cold-start handoff).
   - **(C) Mixed**: remove `/auth/callback` from AASA (Option A for SIWA) and add `app/auth/confirm.tsx` route file (Option B for password reset). Best fix for the immediately critical password-reset path while keeping the OAuth case simple. **Recommended.**

2. **PW-B19-4 disabled-state polish**: ship the pre-disable for Solo invite buttons, or accept the current "click → error message" behavior? Either is defensible.

3. **PW-B19-1 toggle visual state**: in addition to the send-time effective-channel coercion, should the disabled toggle ALSO be visually flipped off (so it's NOT shown as checked-but-disabled)? Small additional one-line change. Pure UX call.

### What is NOT a launch blocker per this audit

- PW-B19-3 (icon flip) — purely configuration.
- PW-B19-4 (invite UI) — works.

### What IS a launch blocker per this audit

- PW-B19-6 — users cannot recover accounts when they have the app installed. Sign in works via Apple natively; sign in via email/password works once known; but if a user forgets their password and tries to recover, the reset link breaks. **Must ship in Build 20.**
- PW-B19-1 — revenue blocker for every phone-less customer lead. **Must ship in Build 20.**
- PW-B19-2 — high-frequency UX regression; users complain. **Must ship in Build 20.**

---

## Notes on the investigation

- **Notion entries that this audit supersedes / cross-references:**
  - [`Pending Work` PW-B19-1 to PW-B19-6](https://www.notion.so/35d32498a1cb8110a7f8e3827cb43cff) — claude.ai source. This audit doc is the live-grounded follow-up.
  - Audit 1 H2 (recovery-session marker) — implementation verified live; works correctly for the single-tap case (PW-B19-6 root cause is upstream of the gate).
  - Audit 8 C2 (`leads_safe` PII view) — view definition verified live; the view is correct. The PW-B19-2 bug is that the mobile detail screen doesn't consume the city/state/zip the view DOES return.
  - Audit 12 H4 / M2 (notifications) — already shipped in web bundle `f313cc6`. Mobile equivalents rode Build 19.
- **Stale or contradicted prior entries:** mobile [`docs/updates-log.md:418-422`](https://github.com/Murdoch45/snapquote-mobile/blob/main/docs/updates-log.md) — post-Audit-8 verification checklist explicitly listed "locked cards show city/state/zip" as a required visual check. Was not run for the detail screen. PW-B19-2 is the predicted regression.
- **Sentry coverage:** no JS-level uncaught exceptions or native crashes appeared in the test window for either project. The "crash" reported in PW-B19-6 is the +not-found.tsx rendering, not a process crash. If a fix attempt does not eliminate the Murdoch-perceived crash even after the route-file change in PW-B19-6 Option B, pull Sentry again for the new test window and re-examine.

---

*Generated 2026-05-11 (PT) by Claude Code on read-only audit of mobile origin/main `a9ed62d` + web origin/main `f313cc6`. Live-source primary; Notion and prior docs used for context only.*
