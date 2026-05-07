# SnapQuote Pre-Submission Audit 2 of 3 — App Store Submission Readiness

**Date:** 2026-05-04 → 2026-05-05 UTC
**App:** SnapQuote: Contractor Leads (App ID `6761979056`, bundle `com.murdochmarcum.snapquote`)
**Mode:** Read-only.
**Author:** Claude Code (Opus 4.7, 1M context)

---

## Executive summary

| Severity | Count |
|---|---|
| **HARD BLOCKERS** | **3** |
| **STRONG RECOMMENDATIONS** | **5** |
| **NICE-TO-HAVES** | **5** |

**Go/no-go verdict: NO-GO as-is.** Three hard blockers stand between SnapQuote and "Add for Review." All three are ASC dashboard fixes Murdoch can complete in roughly 30 minutes, none requires code or a new build. After they're resolved, the audit clears to GO.

The three hard blockers:
1. **No build is attached to App Store Version 1.0.** The version exists with all metadata filled, but `relationships.build = null`. Apple won't accept a submission without a build attached.
2. **Screenshots are uploaded as APP_IPHONE_61 (6.1" Display, 1179×2556), not the size Apple requires for 2026 submissions.** Apple's current rule: at least one of 6.9" (1320×2868), 6.7" (1290×2796), or 6.5" (1284×2778) — 6.1" alone does NOT satisfy. 9 screenshots are uploaded but at the wrong size.
3. **App Privacy responses likely not published.** Couldn't verify via API (Apple doesn't expose this state through the public ASC API), but the existing Pending Work entry documents this as still open — and the rest of the v1.0 page being in `PREPARE_FOR_SUBMISSION` strongly suggests the privacy section never got the Publish click. **Murdoch must verify in the ASC dashboard.**

Everything else is in good shape. The mobile app code passes all of Apple's common rejection-risk checks (Sign in with Apple, Restore Purchases, IAP disclosure language, no Stripe checkout in mobile = guideline 3.1.1 compliance). The 4 subscriptions and 3 consumable IAPs are all `READY_TO_SUBMIT` with English localizations and review screenshots uploaded.

---

## §1 — Hard blockers (rejection-class)

### HB-1. No build attached to App Store Version 1.0

**Severity:** HARD BLOCKER. Cannot submit without a build.

**State (live ASC):**
- App Store Version `16525a57-9e71-4968-a279-59b26f58c0bb`, `versionString: "1.0"`, `appStoreState: PREPARE_FOR_SUBMISSION`, `releaseType: MANUAL`, `copyright: "2026 Murdoch Marcum"`.
- `relationships.build.data: null` — **no build attached.**
- 8 valid builds exist for the app (Build 2 through Build 9), all `processingState: VALID`, all `buildAudienceType: APP_STORE_ELIGIBLE`, all `usesNonExemptEncryption: false`, none expired (expiration 2026-07-19/20).
- Latest is **Build 9** (id `673af167-773d-4cfd-a58a-d75eff1f25d2`, uploaded 2026-04-21T16:58:51-07:00).

**Fix (Murdoch, ASC dashboard):** Open the v1.0 page in App Store Connect → Build section → click "+" → select Build 9 (or whichever build you want to ship). Save.

### HB-2. Screenshots uploaded for the wrong device size

**Severity:** HARD BLOCKER. Apple will reject at submission.

**State (live ASC):**
- One screenshot set: `displayType: APP_IPHONE_61` (6.1" Display).
- 9 screenshots uploaded (`IMG_4785.png` through `IMG_4793.png`), file sizes 494KB–706KB, all `assetDeliveryState: COMPLETE`, all `uploaded: true`. Image dimensions on the IAP review screenshots reveal the same source: 1179×2556 (iPhone 13/14/15 standard, 6.1" Display).
- Zero sets at APP_IPHONE_69 (6.9"), APP_IPHONE_67 (6.7"), or APP_IPHONE_65 (6.5").
- Zero app preview videos (optional — not a blocker).

**Why this rejects:** Per Apple's current 2026 submission requirements, every new iPhone app submission must include screenshots at one of: 6.9" (1320×2868), 6.7" (1290×2796), or 6.5" (1284×2778). Apple auto-scales these down to smaller display sizes; 6.1" screenshots do not auto-scale UP and do not satisfy the "largest required size" rule.

**Fix (Murdoch, ASC dashboard):** Either re-render the existing 9 screenshots at 6.5"/6.7"/6.9" (simplest if you have the Figma/source), OR re-take 3+ screenshots on a real iPhone 14 Plus / 15 Plus / 16 Pro Max / 17 Pro Max simulator. Upload to ASC v1.0 page → Screenshots section → 6.7" or 6.9" iPhone display. Apple will auto-scale to 6.1" and 5.5" automatically. Minimum 3, maximum 10.

**Pending Work reconciliation:** the existing Pending Work item said "Zero uploaded; minimum 3 required." Live state contradicts the count (9 ARE uploaded) but agrees on the underlying gap (the right-sized screenshots are missing). The wording in Notion should be updated to "9 uploaded at 6.1"; need 3+ at 6.5"/6.7"/6.9"."

### HB-3. App Privacy "Publish" button likely not clicked

**Severity:** HARD BLOCKER (per existing Pending Work entry; cannot verify via API).

**State:**
- `/v1/apps/{id}/appPrivacyDetails` returned 404 PATH_ERROR — this relationship doesn't exist in the public ASC API. The privacy nutrition labels live in a separate ASC system that the API does not expose.
- App Info localization HAS `privacyPolicyUrl: "https://snapquote.us/privacy"` ✓ but that's a different field from the App Privacy nutrition responses.
- The `app.json` privacy manifest (`NSPrivacyCollectedDataTypes`) declares 5 categories: Email, Name, Phone, PhotosOrVideos, PurchaseHistory. Plus 2 NSPrivacyAccessedAPI categories (UserDefaults, FileTimestamp). `NSPrivacyTracking: false`. These are the iOS Privacy Manifest, NOT the ASC App Privacy nutrition labels — they're related but separate.
- Pending Work entry "Click Publish on App Privacy responses (App Store Connect) — BLOCKER" remains open and unresolved.

**Fix (Murdoch, ASC dashboard):** Open https://appstoreconnect.apple.com/apps/6761979056 → App Privacy. Confirm the data-type responses match the codebase (Email, Name, Phone, Photos, PurchaseHistory) and click the **blue "Publish" button**. The page should transition from "In Progress" to "Published" or similar visible confirmation.

**Cross-reference with code (helps confirm App Privacy answers):**

| Privacy Category | Mobile evidence | App Store Connect declaration expected |
|---|---|---|
| Contact Info — Email | Supabase auth, account creation | Yes, linked, app functionality |
| Contact Info — Name | Onboarding business name, contractor profile | Yes, linked, app functionality |
| Contact Info — Phone | Profile + customer phone fields | Yes, linked, app functionality |
| Contact Info — Address | Business address (Google Places) | Yes, linked, app functionality |
| User Content — Photos | Lead photos, customer photos | Yes, linked, app functionality |
| Identifiers — User ID | Supabase user ID, RC `appUserID = orgId` | Yes, linked, analytics + functionality |
| Identifiers — Device ID | Push token registration (Expo push) | Yes, linked, app functionality |
| Diagnostics — Crash data | Sentry SDK | Yes, NOT linked, app functionality |
| Diagnostics — Performance | Sentry, Vercel analytics | Yes, NOT linked, app functionality |
| Purchases — Purchase History | RevenueCat IAP | Yes, linked, app functionality (matches `app.json` manifest) |
| Usage Data | None directly tracked in mobile (no analytics SDK like Mixpanel/Amplitude) | Likely No — verify |

**Important:** Mobile has NO Meta Pixel, Google Analytics, Mixpanel, Amplitude, PostHog, etc. (verified earlier in Architecture & Stack — those are web-only). So "Tracking Data" should be **No** and "Data Used to Track You" should be empty. If the existing App Privacy answers say otherwise, they need correction before Publish.

---

## §2 — Strong recommendations (not auto-rejection but high-risk)

### SR-1. App Subtitle is empty

**State:** `appInfoLocalizations[0].subtitle: null`.

**Why it matters:** Subtitle (30-char max) appears below the app name in App Store search results and the product page. Empty subtitle = missing prime above-the-fold real estate. Apple Search optimization also reads subtitle text.

**Fix:** ASC App Information → fill subtitle. Suggested copy (≤30 chars): `"AI estimates for contractors"` (29 chars) or `"Contractor leads + estimates"` (28 chars) or `"Lead inbox & AI quoting"` (23 chars).

### SR-2. Demo account has limited data; reviewer would see an empty dashboard

**State:**
- App Review Detail correctly lists `demoAccountName: demo@snapquote.us`, `demoAccountPassword: 123456SQ!`, `demoAccountRequired: true`. Login verified to work — `last_sign_in_at: 2026-04-21 01:37:39 UTC`.
- BUT the demo org (`bce3a561-455c-468e-9408-497803811800`) is on **plan SOLO**, has **4 leads**, **0 quotes**, **0 unlocks**, 0 bonus credits. A reviewer logging in sees a near-empty dashboard.
- A second account `demo@snapquote.com` exists with much richer data (BUSINESS plan, 16 leads, 10 quotes, 10 unlocks, 12 bonus credits), but `last_sign_in_at: null` — credentials are not the documented `123456SQ!` and the reviewer can't log into it.

**Why it matters:** Apple reviewers test apps using the credentials in App Review Notes. If they log in and see "0 quotes, 4 leads", they may flag the app as non-functional or impossible to evaluate ("cannot demonstrate IAP flow"). This is a common rejection cause.

**Fix (Murdoch, choose one):**
- (A) Seed `demo@snapquote.us`'s org with realistic test data: 5–10 leads in various states (NEW, QUOTED, ACCEPTED), 3–5 sent quotes (one VIEWED, one ACCEPTED), and upgrade the org to BUSINESS plan so the reviewer sees the full feature surface.
- (B) Reset `demo@snapquote.com`'s password to `123456SQ!` and update App Review Notes to point at `demo@snapquote.com` instead.
- (C) Provide TestFlight invitation in App Review Notes pointing at a build with seeded local data.

(A) is the cleanest. The Pending Work entry that flagged this is still open.

### SR-3. groupLevel ordering doesn't match Notion's stated preference

**State:** Current order: L1=Business Annual, L2=Business Monthly, L3=Team Annual, L4=Team Monthly.
Notion Pending Work desired order: L1=Business Monthly, L2=Business Annual, L3=Team Monthly, L4=Team Annual.

**Why it matters:** `groupLevel` controls Apple's automatic upgrade/downgrade classification — moving up = immediate proration, down = deferred. The current state has tier-correct ordering (Business above Team) but Annual-above-Monthly within each tier. Murdoch's stated desire is Monthly-above-Annual within each tier. UX-significant but **not** an Apple submission blocker.

**Fix (Murdoch, ASC dashboard):** Either confirm the current state is what you actually want (and update Notion), or manually drag-and-drop to the desired order at https://appstoreconnect.apple.com/apps/6761979056/distribution/subscription-groups/22024834.

### SR-4. Per-IAP `reviewNote` is null on all 7 IAPs (4 subs + 3 consumables)

**State:** Every subscription and consumable has `reviewNote: null`. The version-level App Review Notes is filled (with a strong, well-written paragraph about Stripe vs IAP that proactively addresses guideline 3.1.1). 

**Why it matters:** Per-IAP notes are optional but often useful — they tell the reviewer how to test that specific IAP without hunting through the app. With version-level notes already covering the global IAP context, per-IAP notes are mostly nice-to-have here. Marginally improves reviewer experience.

**Fix (optional):** Add brief notes per IAP, e.g. on `snapquote_business_annual`: "Sign in as demo@snapquote.us → More tab → Plan → toggle Business Annual → tap Switch to Business → complete sandbox purchase."

### SR-5. Unmerged worktree branch `claude/crazy-heyrovsky-2e3c05` carries 9 commits not in main

**State:** `git log main..claude/crazy-heyrovsky-2e3c05` returns 9 commits including substantive fixes:
- `0e65d3f` "fix: 5 high-priority pre-ship items (google oauth, multi-org auth, invite cap, plan refresh, dup subscriptions)"
- `f40fd1c` "fix: credit pack display prices match stripe + mobile signout push token cleanup"
- `ca56eec` "fix: google sign-in post-callback redirect to landing"
- `e434bed` "fix: google sign-in callback 500"
- `55e538f` "fix: critical security revoke + telnyx campaign binding"
- 4 docs commits + onboarding subtext (already on main as 39ae97d, redundant)

Modified code files vs main: `app/(auth)/login.tsx`, `app/(auth)/signup.tsx`, `lib/auth.tsx`, `lib/notifications.ts` (4 substantive files, 500+ insertions).

**Why it matters:** **Build 9 was uploaded 2026-04-21 from main; these unmerged commits are NOT in Build 9.** If Build 9 is the chosen submission build, it ships WITHOUT these fixes — including Google Sign-In redirect fix and per-device signOut push token cleanup. None of these are Apple-rejection-class issues, but they're real-user-facing functionality gaps.

**Fix (Murdoch, two paths):**
- (A) **Ship Build 9 as-is for v1.0**, plan the merge + a v1.0.1 mobile build for the next 30 days. Tradeoff: launch v1.0 with a known broken Google Sign-In redirect (real users hitting Google OAuth land on the marketing page instead of `/app`).
- (B) **Merge the branch + push a new EAS build before submission.** Tradeoff: ~1 day delay for build + Apple processing.

(B) is the safer path given the Google Sign-In bug. Apple won't reject for it (works around it), but launch users will hit it.

---

## §3 — Nice-to-haves

### NTH-1. Marketing URL is null
`appStoreVersionLocalizations[0].marketingUrl: null`. App Store product page links to a website. Set to `https://snapquote.us` (same as supportUrl) for completeness. 1-minute fix in ASC dashboard.

### NTH-2. App Preview videos absent
Zero `appPreviewSets` for v1.0. Optional. App Previews can drive 25%+ install lift but require iPhone footage at the same display sizes as screenshots. Defer to post-launch unless you have video already shot.

### NTH-3. Subscription Group localization in `PREPARE_FOR_SUBMISSION`
`subscriptionGroupLocalizations[0].state: PREPARE_FOR_SUBMISSION`. This transitions to `WAITING_FOR_REVIEW` automatically when the version is submitted. No action needed — informational.

### NTH-4. Old Stripe Business Annual price still active
`price_1TLCZcFNX8cpZFmw0HVXNHwm` ($383.99/yr) still has `active=true` in Stripe. Zero subscriptions, no code references. Hygiene-only — already flagged in earlier audit. Archive at convenience.

### NTH-5. RC dashboard `display_name` labels stale on annuals
Already documented in `docs/asc-rc-final-alignment-2026-05-04.md`. Cosmetic-only, non-user-facing. Defer indefinitely or fix in 30 seconds in the RC dashboard.

---

## §4 — What's clean (no action needed)

This section is intentionally rich because it's the audit's clearest signal that Apple-submission-grade hygiene exists across most of the surface:

### App-level metadata ✅
- App name: "SnapQuote: Contractor Leads"
- Bundle ID: com.murdochmarcum.snapquote
- Primary category: BUSINESS
- Age rating: FOUR_PLUS (4+)
- Brazil age rating: SELF_RATED_L
- Content Rights: DOES_NOT_USE_THIRD_PARTY_CONTENT
- Privacy Policy URL: https://snapquote.us/privacy ✓ (resolves)
- Streamlined Purchasing enabled

### Version 1.0 metadata ✅
- versionString: 1.0
- copyright: "2026 Murdoch Marcum"
- description: 365 chars, well-written, no placeholders
- keywords: "contractor,leads,estimates,quoting,landscaping,roofing,lawn care,pressure washing,fence,CRM" (within 100-char limit)
- promotionalText: "Get AI-powered estimates instantly. See job details and pricing before you commit. Only pay for the leads you want." (within 170-char limit)
- supportUrl: https://snapquote.us
- usesIdfa: null (not using IDFA — no ATT prompt needed)
- releaseType: MANUAL (you control launch timing)

### Subscriptions (4 of 4 READY_TO_SUBMIT) ✅
| Sub | productId | Period | Price (US) | Localization | Review Screenshot |
|---|---|---|---|---|---|
| Team Monthly | snapquote_team_monthly | ONE_MONTH | $19.99 | en-US ✓ | COMPLETE ✓ |
| Team Annual | snapquote_team_annual | ONE_YEAR | $191.99 | en-US ✓ | COMPLETE ✓ |
| Business Monthly | snapquote_business_monthly | ONE_MONTH | $39.99 | en-US ✓ | COMPLETE ✓ |
| Business Annual | snapquote_business_annual | ONE_YEAR | $384.99 | en-US ✓ | COMPLETE ✓ |

All in subscription group `22024834` "SnapQuote Plans" with en-US group localization.

### Consumables (3 of 3 READY_TO_SUBMIT) ✅
| IAP | productId | Type | Localization | Review Screenshot |
|---|---|---|---|---|
| 10 Lead Credits | snapquote_credits_10 | CONSUMABLE | en-US ✓ | COMPLETE ✓ |
| 50 Lead Credits | snapquote_credits_50 | CONSUMABLE | en-US ✓ | COMPLETE ✓ |
| 100 Lead Credits | snapquote_credits_100 | CONSUMABLE | en-US ✓ | COMPLETE ✓ |

### Builds ✅
8 builds (Build 2 through Build 9), all `processingState: VALID`, all `buildAudienceType: APP_STORE_ELIGIBLE`, all `usesNonExemptEncryption: false` (encryption export compliance answered), none expired (expiration July 2026).

### App Review Detail ✅
Per the live ASC API:
```
contactFirstName: Murdoch
contactLastName: Marcum
contactPhone: 4057619006
contactEmail: murdochmarcum@icloud.com
demoAccountName: demo@snapquote.us
demoAccountPassword: 123456SQ!
demoAccountRequired: true
notes: SnapQuote is a B2B SaaS platform for contractors. Web-based subscribers
       (desktop users) manage billing via Stripe on the website at snapquote.us.
       All in-app purchases and subscriptions initiated within the iOS app use
       Apple IAP exclusively. No Stripe payment UI is presented within the iOS
       app. The app complies fully with guideline 3.1.1.
```

The notes proactively address the most common iOS-submission rejection (3.1.1 — non-IAP payment for digital goods). Excellent. Reviewer phone was not normalized to E.164 but Apple accepts US 10-digit.

### Mobile code submission-readiness ✅

| Apple requirement | Mobile code state | Evidence |
|---|---|---|
| Sign in with Apple offered | ✓ | `expo-apple-authentication@55.0.10-canary`, used in `app/(auth)/login.tsx:71`, `signup.tsx:77`, `OAuthButtons.tsx:38` (uses Apple's official `AppleAuthenticationButton` component). FULL_NAME + EMAIL scopes. |
| SIWA available alongside other 3rd-party auth (Google) | ✓ | OAuth buttons component renders both Apple + Google. |
| Restore Purchases button | ✓ | `app/(tabs)/more/plan.tsx:884` (TouchableOpacity with text "Restore Purchases"), wired to `handleRestore` → `lib/revenuecat.ts:53` `restorePurchases()`. Visible on plan screen. |
| Subscription disclosure language | ✓ | `app/(tabs)/more/plan.tsx:760-786`: "Subscriptions automatically renew at the price shown above unless cancelled at least 24 hours before the end of the current period. Payment will be charged to your Apple ID at confirmation of purchase. You can manage or cancel your subscription anytime in your Apple ID account settings." Plus Terms of Use + Privacy Policy links. |
| No Stripe checkout in mobile (guideline 3.1.1) | ✓ | Grep returned zero matches for `stripe-js`, `loadStripe`, `checkout.stripe.com`. The only Stripe-adjacent calls are `openAuthenticatedBrowser("/credits")` and `openAuthenticatedBrowser("/plan?scroll=plan-options")` for users already on Stripe (Stripe-billed users only see "Manage on web" link, never an in-app checkout). |
| Stripe-vs-IAP gating logic correct | ✓ | Tri-state `billing_source` ("stripe"/"iap"/null) with `!isStripeUser` semantics (`plan.tsx:264-265`). Stripe users see "Manage on web" link only. IAP users + new signups see the carousel. |
| Privacy manifest declared | ✓ | `app.json` `NSPrivacyCollectedDataTypes` lists Email/Name/Phone/Photos/PurchaseHistory; `NSPrivacyAccessedAPI` lists UserDefaults + FileTimestamp; `NSPrivacyTracking: false`. |
| `ITSAppUsesNonExemptEncryption` | ✓ | `app.json:24` set to `false`. Matches build's `usesNonExemptEncryption: false`. |
| `usesAppleSignIn` | ✓ | `app.json:19`. |
| Universal links / associated domains | ✓ | `applinks:snapquote.us`, `applinks:www.snapquote.us`. Path prefixes `/invite`, `/auth/callback`, `/auth/confirm`. |

---

## §5 — Pending Work reconciliation

For each item in Notion Pending Work, current status:

| Pending Work entry | Source | Live status |
|---|---|---|
| Upload iPhone 6.5" screenshots — BLOCKER | Claude Code | **PARTIALLY OUTDATED.** 9 screenshots ARE uploaded but for 6.1" Display, not 6.5"+. Hard blocker still open but for "wrong size" not "zero count." See HB-2. |
| Click Publish on App Privacy responses — BLOCKER | Claude Code | **STILL OPEN, cannot verify via API.** See HB-3. |
| Reorder subscription levels in ASC (manual) | Claude Code | **PARTIALLY OUT OF DATE.** Doc'd desired order: L1 Business Monthly. Live: L1 Business Annual. UX choice; not a submission blocker. See SR-3. |
| Update ASC copy: "5 team seats" matches code — RESOLVED | Claude Code | **CONFIRMED RESOLVED.** Sub localizations show "5 seats" per Audit 1; code is at 5 in `lib/plans.ts`. |
| Fill App Subtitle + Promotional Text | Claude Code | **PARTIAL.** Promotional Text is filled. Subtitle is null. See SR-1. |
| Seed sample leads/quotes for demo@snapquote.us | Claude Code | **STILL OPEN.** Demo org has 4 leads, 0 quotes. See SR-2. |
| Complete Digital Services Act (EU) | Claude Code | **N/A for US launch.** Blocks EU rollout only. Defer. |
| BUSINESS seat constant refactor | Claude Code | **Not blocking.** Hygiene only. |
| TopBar.tsx typed-routes errors (tech debt) | Claude Code | **Not blocking.** |
| Verify mobile CI / git remote | Claude Code | **Not blocking.** |
| Stripe price metadata audit | Claude Code | **Not blocking.** |
| Android release pipeline | Claude Code | **Not blocking iOS submission.** |
| Re-enable EAS Update OTA | Claude Code | **Not blocking.** Wait for Build 6+ stable on TestFlight. |
| AI estimator schema reduction | claude.ai | **Not blocking.** Latency optimization only. |
| Merge `claude/crazy-heyrovsky-2e3c05` BEFORE next EAS build | claude.ai | **STILL OPEN.** 9 commits unmerged. See SR-5. |
| Stripe Business Annual price migration | Claude Code | **RESOLVED 2026-05-04** ($384.99/yr live at `price_1TTpUuFNX8cpZFmwUMWMg77W`, Vercel redeploy verified READY). Old price still `active=true` in Stripe — hygiene-only. |
| ASC API key Y8MMFHSC37 rejection | Claude Code | **RESOLVED 2026-05-04** (was JWT exp-window, not key revocation; patched in `appstore-connect-mcp-server@1.1.3`). |

The user-mentioned items not appearing in Pending Work ("Stripe users seeing IAP prices", "Google Places autocomplete on onboarding", "Back/home button on onboarding", "Hero scroll", "Apple Sign-In button restoration") are all resolved per Bugs & Fixes:
- **Stripe-IAP gate** — RESOLVED via tri-state `billing_source` (Bugs & Fixes: "Stripe users seeing IAP prices on plan page").
- **Google Places autocomplete on onboarding step 3** — RESOLVED via legacy-API switch + blur-race fix (Bugs & Fixes: "Onboarding step 3 Google Places dropdown didn't appear", commit `c61a3f9`).
- **Onboarding escape hatch** — RESOLVED via tappable wordmark + signOut confirmation (Bugs & Fixes: "Onboarding had no escape hatch", commit `594ef25` then `23d7560`).
- **Hero scroll fix** — Not found in Notion. May have been fixed silently or never opened.
- **Apple Sign-In button restoration** — Not found in Notion. SIWA is fully wired in code (verified in §4).

---

## §6 — Required Murdoch manual actions

Ordered by criticality. Items 1–3 are the hard blockers; 4–7 are strong recommendations.

1. **(HB-1) ASC v1.0 → Build section → attach Build 9** (or whichever build you want to ship). Single click, takes 30 seconds.
2. **(HB-2) ASC v1.0 → Screenshots section → upload 3+ screenshots at 6.5"/6.7"/6.9"** display sizes. Apple auto-scales down to smaller sizes. Easiest: re-render the 9 existing PNGs at a larger size and replace, OR re-take on a Pro Max simulator.
3. **(HB-3) ASC App Privacy section → verify all data-type responses are correct (per the table in §1) → click the blue "Publish" button.** Without this click, "Add for Review" is impossible.
4. **(SR-1) ASC App Information → fill Subtitle** (≤30 chars). Suggestions in §2.
5. **(SR-2) Seed `demo@snapquote.us` org with realistic test data** — minimum 5 leads, 3 quotes, BUSINESS plan. Or update App Review Notes to point at a different demo path. See §2 for options.
6. **(SR-3) Decide on `groupLevel` ordering** — current state vs Notion's desired state. Manual drag-and-drop in ASC if you want to change.
7. **(SR-5) Decide on `claude/crazy-heyrovsky-2e3c05` merge** — ship Build 9 without those fixes (and plan v1.0.1 for after launch), or merge + new EAS build (~1 day delay).

---

## §7 — Final go/no-go verdict

**NO-GO as of 2026-05-04 / 2026-05-05 UTC.** 

Three hard blockers stand between SnapQuote and "Add for Review." All three are dashboard-only fixes Murdoch can complete in roughly 30 minutes total, none requires code changes or a new EAS build. Specifically:

1. Attach a build to v1.0 (~30 seconds in ASC).
2. Upload right-sized screenshots (~5–10 minutes in ASC if Figma/source PNGs already exist; longer if re-shooting on simulator).
3. Click the "Publish" button on App Privacy (~1 minute, after verifying responses match §1's expected table).

After those three: **GO** for first App Store submission. The IAPs, builds, app metadata, demo account credentials, mobile-code submission-readiness, App Review Notes, subscription localizations, IAP review screenshots, and Apple-required UI elements (Sign in with Apple, Restore Purchases, IAP disclosure, no Stripe checkout) are all in good shape.

Strong recommendations 1–5 should be addressed but won't cause auto-rejection. The two highest-value soft fixes are:
- **SR-2** (demo account data) — meaningfully reduces Apple reviewer "cannot evaluate" rejection risk.
- **SR-1** (subtitle) — meaningfully helps App Store search ranking on day 1.

The final pre-flight check before clicking "Add for Review": confirm the build's TestFlight track has `Build 9` (or chosen build) showing as `Ready to Test` (or similar passing state) and that you've smoke-tested it on a real device end-to-end against `demo@snapquote.us` to make sure auth, IAP purchase + restore, and at least one estimate flow work.

---

*End of report.*
