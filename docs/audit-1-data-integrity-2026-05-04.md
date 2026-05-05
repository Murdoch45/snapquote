# Audit 1 — Cross-System Data Integrity

**Date:** 2026-05-04
**Auditor:** Claude Code (Opus 4.7, 1M context)
**Scope:** Read-only audit of data parity across App Store Connect, Stripe, RevenueCat, Supabase, Resend, Telnyx, and the web + mobile codebases.
**Goal:** Surface every disagreement between the systems that need to stay in sync before App Store submission.

---

## Executive Summary

| Severity | Count | Headline |
|---|---|---|
| **CRITICAL** | 2 | Telnyx 10DLC campaign **not bound** to production phone number; suspected price drift between Stripe and RevenueCat for annual plans (need ASC value to confirm) |
| **HIGH** | 4 | Stale Stripe "Solo" recurring product (SOLO is free); 6 abandoned Stripe CLI test products in live dashboard; vestigial `$19`/`$39` labels in `lib/stripe.ts`; Notion (Bugs & Fixes) contradicts Notion (updates-log) on 10DLC status |
| **MEDIUM** | 3 | Seat limit duplicated in 4 places (no `plan_config` table); RevenueCat ASC API key not configured; mobile plan-card highlights array uses hardcoded strings (`"5 team members"`) instead of `planConfig` |
| **LOW** | 2 | `app_store_connect_api_key_configured: false` in RevenueCat (subscription_key works, but ASC product-management features won't); minor cosmetic mismatches in display labels |

**Top blockers to fix before "Add for Review":**
1. Bind `+17169938159` to the approved 10DLC campaign in Telnyx Mission Control portal — until done, every `sent_via=["text"]` event records as sent but customers never receive the SMS.
2. Verify the **actual ASC price** on `snapquote_team_annual` and `snapquote_business_annual`. If ASC matches RevenueCat's labels ($189.99 / $389.99), Stripe is wrong. If ASC matches Stripe ($191.99 / $383.99), RevenueCat's display labels are stale. Either way, a user buying the same plan on web vs iOS would pay a different amount today.

---

## Dimension 1: Plans, Pricing, Billing Intervals

### Source-of-truth files inventoried

| Source | File / Endpoint | Authoritative for |
|---|---|---|
| Web TS | [lib/plans.ts](lib/plans.ts) | `PLAN_MONTHLY_CREDITS`, `PLAN_SEAT_LIMITS` |
| Web API | [app/api/plans/config/route.ts](app/api/plans/config/route.ts) | Mobile hydration (re-exports web `lib/plans.ts`) |
| Web Stripe | [lib/stripe.ts:74-114](lib/stripe.ts:74) | Stripe price ID lookup; per-plan label strings |
| Web UI | [components/plan/PlanOptionsSection.tsx:37-69](components/plan/PlanOptionsSection.tsx:37) | Customer-facing pricing strings on web `/app/plan` |
| Mobile TS | `C:/Users/murdo/SnapQuote-mobile/lib/plans.ts` | Cold-boot fallback; hydrated from web `/api/plans/config` |
| Mobile UI | `C:/Users/murdo/SnapQuote-mobile/app/(tabs)/more/plan.tsx:72-91` | `PLAN_OPTIONS` highlight strings (hardcoded counts) |
| Postgres | `accept_invite_token`, `handle_auth_user_pending_invites` RPCs | Seat-limit enforcement at invite time |
| Stripe (live) | `prices.list` per product | Actual recurring/one-time charge amounts |
| RevenueCat (live) | offerings → packages | Package `display_name` labels (informational) |
| App Store Connect | (not queryable — see "Couldn't check") | Actual price the iOS user pays |

### Plan-by-plan comparison

#### SOLO

| Attribute | Web TS / Mobile fallback | Web UI string | Stripe | RevenueCat | Postgres RPC |
|---|---|---|---|---|---|
| Display name | n/a | "Solo" | "Solo" (`prod_UJqGrSk27Qgc0f`) | n/a (not in offerings) | n/a |
| Price | n/a | "Free" | **$19.99/mo recurring** ⚠ | n/a | n/a |
| Seats | 1 | 1 | n/a | n/a | 1 |
| Monthly credits | 5 | 5 | n/a | n/a | n/a |

**Findings:**
- **HIGH** — Stripe has a "Solo" product (`prod_UJqGrSk27Qgc0f`) with a recurring **$19.99/mo** price (`price_1TLCZqFNX8cpZFmwfaWXhXKP`). The product is not referenced in [lib/stripe.ts](lib/stripe.ts) (only `team` and `business` are routed through `getStripePlanConfig`), and the web UI shows SOLO as "Free". This product is orphaned in Stripe and would charge $19.99 if anyone routed a checkout through it.

#### TEAM

| Attribute | Web TS / Mobile | Web UI string | Stripe | RevenueCat label | Postgres RPC |
|---|---|---|---|---|---|
| Display name | "TEAM" | "Team" | "Snapquote Team Plan" (`prod_UJqGjUmWNMlSPQ`) | n/a (uses package labels) | n/a |
| Monthly price | n/a | "$19.99/mo" | **$19.99** (1999¢, `price_1TLCZnFNX8cpZFmwZeXOL63t`) | "Team Monthly - $19.99/mo" | n/a |
| Annual price | n/a | "$15.99/mo billed $191.99/yr" | **$191.99** (19199¢, `price_1TLCZmFNX8cpZFmwTFjEf313`) | "Team Annual - **$189.99/yr**" ⚠ | n/a |
| Seats | 2 | 2 | (no metadata) | n/a | 2 |
| Monthly credits | 20 | 20 | (no metadata) | n/a | n/a |
| `lib/stripe.ts` label | — | — | **`monthlyPrice: "$19"`** ⚠ | — | — |

#### BUSINESS

| Attribute | Web TS / Mobile | Web UI string | Stripe | RevenueCat label | Postgres RPC |
|---|---|---|---|---|---|
| Display name | "BUSINESS" | "Business" | "Snapquote Business Plan" (`prod_UJqGzwTrDYV1rs`) | n/a | n/a |
| Monthly price | n/a | "$39.99/mo" | **$39.99** (3999¢, `price_1TLCZdFNX8cpZFmwokht9uyb`) | "Business Monthly - $39.99/mo" | n/a |
| Annual price | n/a | "$33.99/mo billed $383.99/yr" | **$383.99** (38399¢, `price_1TLCZcFNX8cpZFmw0HVXNHwm`) | "Business Annual - **$389.99/yr**" ⚠ | n/a |
| Seats | 5 | 5 | (no metadata) | n/a | 5 (`else` branch) |
| Monthly credits | 100 | 100 | (no metadata) | n/a | n/a |
| `lib/stripe.ts` label | — | — | **`monthlyPrice: "$39"`** ⚠ | — | — |

### Findings — Dimension 1

- **CRITICAL** — **Annual price drift between Stripe and RevenueCat package labels.**
  - Team Annual: Stripe charges **$191.99/yr**; RevenueCat display label says **$189.99/yr** ($2 delta).
  - Business Annual: Stripe charges **$383.99/yr**; RevenueCat display label says **$389.99/yr** ($6 delta).
  - The mobile app reads the actual price from `pkg.product.priceString` ([app/(tabs)/more/plan.tsx:575](app/(tabs)/more/plan.tsx:575)), which surfaces the App Store Connect price directly, so the RC `display_name` is informational only. **However, this means the RC label has drifted from at least one of {ASC, Stripe}.** Without ASC access I cannot determine which is the source of truth — but the implication is real: a user comparing the iOS price to the web price ($191.99/yr in [components/plan/PlanOptionsSection.tsx:53](components/plan/PlanOptionsSection.tsx:53)) would see a $2–$6 difference if ASC matches the RC label. Murdoch needs to verify ASC manually.

- **HIGH** — **`lib/stripe.ts` returns vestigial `monthlyPrice: "$19"` and `"$39"` labels** ([lib/stripe.ts:96](lib/stripe.ts:96), [lib/stripe.ts:104](lib/stripe.ts:104)). The web UI ([components/plan/PlanOptionsSection.tsx](components/plan/PlanOptionsSection.tsx)) uses its own `PLAN_OPTIONS` constants with the correct `$19.99/mo` / `$39.99/mo` strings. `getStripePlanConfig` is called from [app/api/stripe/checkout/route.ts](app/api/stripe/checkout/route.ts) but only the `priceId` is consumed — the `monthlyPrice` label is dead weight. Drift risk: if a future caller does use this label, a customer would see "$19" while being charged $19.99.

- **HIGH** — **Six abandoned `myproduct` test products in live Stripe** (`prod_UJqGmM6Dd5QBWd`, `prod_UJqGK24B9qyheX`, `prod_UJqGSUc7XwabDp`, `prod_UJqGqAMI4BrUhQ`, `prod_UJqGRdcUm63JMy`, `prod_UJqGBspoUzLwrT`), all `description: "(created by Stripe CLI)"`. Cleanup before launch — they clutter the dashboard and create confusion if anyone audits Stripe later.

- **MEDIUM** — **Seat limit duplicated in 4 places** with no shared source of truth:
  1. [lib/plans.ts:9-13](lib/plans.ts:9) (web)
  2. `C:/Users/murdo/SnapQuote-mobile/lib/plans.ts:14-17` (mobile fallback)
  3. `accept_invite_token` RPC `case ... when v_plan = 'BUSINESS' then 5 else 5 end`
  4. `handle_auth_user_pending_invites` RPC `case ... else 5 end`
  Currently consistent (all at SOLO=1, TEAM=2, BUSINESS=5) after migration `20260501000249_business_seat_limit_5`, but no single source. Confirmed: `public.plan_config` table does **not** exist (verified via `information_schema`). Pending Work item already tracks this.

- **MEDIUM** — **Mobile `PLAN_OPTIONS` `highlights` strings are hardcoded** (`"5 team members"`, `"20 monthly credits"`, `"100 monthly credits"` — `app/(tabs)/more/plan.tsx:77-90`). The same file uses `planConfig.credits[option.plan]` and `planConfig.seats[option.plan]` correctly for the stat-box display (lines 675, 681), but the bulleted highlights bypass `planConfig`. If web `lib/plans.ts` changes, the highlights will silently lie until someone touches the file again. Same drift risk on web `PlanOptionsSection.tsx:45,56,67`.

- **MEDIUM** — **Stripe products have no seat or credit metadata.** The Pending Work item mentions auditing Stripe price metadata; confirmed via `prices.list`: no `metadata` field on any of the real plans. If a future tool reads from Stripe to determine seats, it will return null — currently nothing reads from Stripe metadata, so this is latent risk only.

- **LOW** — **Trial length not encoded anywhere.** The mobile UI shows "Start Free Trial" (`app/(tabs)/more/plan.tsx:717`) but the trial duration comes from RevenueCat `trial_duration` on the subscription product, which all 4 RC subscription products report as `null`. Apple's intro offer config (in ASC) is the actual source. Couldn't verify ASC. RevenueCat reports zero trial config.

---

## Dimension 2: IAP Product IDs

### ASC ↔ RevenueCat ↔ Mobile code

| ASC product (per Notion + mobile code) | RevenueCat `store_identifier` | Mobile code reference |
|---|---|---|
| `snapquote_team_monthly` | `snapquote_team_monthly` ✓ | `app/(tabs)/more/plan.tsx:337` ✓ |
| `snapquote_team_annual` | `snapquote_team_annual` ✓ | `app/(tabs)/more/plan.tsx:339` ✓ |
| `snapquote_business_monthly` | `snapquote_business_monthly` ✓ | `app/(tabs)/more/plan.tsx:340` ✓ |
| `snapquote_business_annual` | `snapquote_business_annual` ✓ | `app/(tabs)/more/plan.tsx:341` ✓ |
| `snapquote_credits_10` | `snapquote_credits_10` ✓ | `app/(tabs)/more/credits.tsx:27` ✓ |
| `snapquote_credits_50` | `snapquote_credits_50` ✓ | `app/(tabs)/more/credits.tsx:28` ✓ |
| `snapquote_credits_100` | `snapquote_credits_100` ✓ | `app/(tabs)/more/credits.tsx:29` ✓ |

### RevenueCat offerings ↔ packages ↔ products

| Offering | `lookup_key` | Packages | Products attached |
|---|---|---|---|
| SnapQuote Plans | `default` (current) | 4: `business_annual`, `business_monthly`, `team_annual`, `team_monthly` | All 4 subscriptions, 1:1 |
| Credit Packs | `credits` | 3: `credits_100`, `credits_50`, `credits_10` | All 3 consumables, 1:1 |

### Findings — Dimension 2

- **No drift.** All 7 IAP product IDs are present in RevenueCat with `state: active`, attached 1:1 to packages, and referenced by the mobile code at the exact strings expected.
- **Verified via API:** RevenueCat `app_id: appa3a9bdc7c8` has `bundle_id: com.murdochmarcum.snapquote` — matches `app.json` and `eas.json submit.production.ios.ascAppId: 6761979056`.
- **No orphans in any direction.**

---

## Dimension 3: Identifiers

| Identifier | Value | Sources verified |
|---|---|---|
| iOS Bundle ID | `com.murdochmarcum.snapquote` | [app.json:16](C:/Users/murdo/SnapQuote-mobile/app.json:16); RevenueCat `appa3a9bdc7c8.bundle_id` (live) ✓ |
| Android Package | `com.snapquote.mobile` | [app.json:92](C:/Users/murdo/SnapQuote-mobile/app.json:92) — **intentional split, documented in Pending Work** |
| ASC App ID | `6761979056` | [eas.json:33](C:/Users/murdo/SnapQuote-mobile/eas.json:33); Notion Architecture & Stack ✓ |
| RevenueCat Project ID | `proj39ead10c` | RevenueCat API (live) ✓ |
| Supabase Project Ref | `upqvbdldoyiqqshxquxa` | Supabase API (live, status `ACTIVE_HEALTHY`); Notion ✓ |
| Mobile API URL | `https://snapquote.us` | [.env.example:8](C:/Users/murdo/SnapQuote-mobile/.env.example:8) |
| Mobile App URL | `https://snapquote.us` | [.env.example:14](C:/Users/murdo/SnapQuote-mobile/.env.example:14) |
| iOS URL scheme | `snapquotemobile` | [app.json:8](C:/Users/murdo/SnapQuote-mobile/app.json:8); referenced 4× in mobile code (login, signup, OAuth callbacks, `_layout.tsx:54`) ✓ |
| iOS Associated Domains | `applinks:snapquote.us`, `applinks:www.snapquote.us` | [app.json:87-88](C:/Users/murdo/SnapQuote-mobile/app.json:87) |
| Apple Sign-In | `usesAppleSignIn: true` | [app.json:19](C:/Users/murdo/SnapQuote-mobile/app.json:19) — native iOS uses bundle ID as Service ID; no separate Service ID needed |
| Sentry org | `snapquote` | [app.json:188](C:/Users/murdo/SnapQuote-mobile/app.json:188); [eas.json:11,18,25](C:/Users/murdo/SnapQuote-mobile/eas.json:11) ✓ |
| Sentry project | `snapquote-mobile` | Same files ✓ |
| EAS project ID | `ef90bb98-9411-4547-b9a0-f6dbcbc21ec4` | [app.json:200](C:/Users/murdo/SnapQuote-mobile/app.json:200); also referenced in `updates.url` ✓ |

### Findings — Dimension 3

- **No drift.** Every identifier matches across all sources I could query. The intentional iOS/Android bundle split (`com.murdochmarcum.snapquote` vs `com.snapquote.mobile`) is documented in Notion Pending Work as a known difference, not a bug.

---

## Dimension 4: Entitlements

### RevenueCat entitlements (live API)

| ID | `lookup_key` | `display_name` | State |
|---|---|---|---|
| `entl4353fa7d61` | `business` | Business | active |
| `entlcac5098bbd` | `team` | Team | active |

### Code references

| File | Check expression | Matches RC `lookup_key`? |
|---|---|---|
| `lib/revenuecat.ts:67` | `info.entitlements.active.business` | ✓ (case-sensitive match on `business`) |
| `lib/revenuecat.ts:68` | `info.entitlements.active.team` | ✓ (case-sensitive match on `team`) |
| `app/(tabs)/more/plan.tsx:117,134` | `customerInfo.entitlements.active.business` / `.team` | ✓ |
| `app/(tabs)/more/plan.tsx:310` | `info.entitlements.active.business ?? info.entitlements.active.team` | ✓ |

### Findings — Dimension 4

- **No drift.** RevenueCat entitlement `lookup_key` values are exactly `business` / `team` (lowercase), and every code-side check uses the same casing. Notion's claim of "lowercase entitlements" is accurate.
- **Couldn't verify entitlement→product attachments** (the RC `list-entitlements` endpoint doesn't include attached products inline, and `get-products-from-entitlement` was not invoked to keep the audit time-bounded). However, the offerings response shows all 4 subscriptions are `state: active` and attached to packages, so they are reachable. This means the linkage works at runtime; only the explicit attachment table is unverified.

---

## Dimension 5: Email/SMS Sender Configs

### Resend

| Config | Source | Verified |
|---|---|---|
| Verified domain | `snapquote.us`, status `verified`, sending enabled | Resend API (live) ✓ |
| Transactional from | `SnapQuote <estimates@snapquote.us>` (default fallback) | [lib/notify.ts:137](lib/notify.ts:137) ✓ |
| Lifecycle from | `SnapQuote <noreply@snapquote.us>` (default fallback) | [lib/notify.ts:132](lib/notify.ts:132) ✓ |
| Env override (transactional) | `RESEND_FROM_EMAIL` | [lib/notify.ts:135](lib/notify.ts:135), [lib/env.ts:21](lib/env.ts:21) |
| Env override (noreply) | `RESEND_FROM_EMAIL_NOREPLY` | [lib/notify.ts:130](lib/notify.ts:130) — **NOT in `lib/env.ts` schema** |

### Findings — Resend

- **Both `estimates@snapquote.us` and `noreply@snapquote.us` are valid** — domain `snapquote.us` is verified in Resend with sending enabled.
- **LOW** — `RESEND_FROM_EMAIL_NOREPLY` is read in [lib/notify.ts:130](lib/notify.ts:130) but is **not declared** in the `serverEnvSchema` at [lib/env.ts:10-22](lib/env.ts:10). If `getServerEnv()` is called for type-safe env access, this var won't be parsed. Currently low impact because `lib/notify.ts` reads it directly from `process.env` rather than via `getServerEnv()`. Still drift-prone.
- **No drift between code and live Resend.**

### Telnyx

| Config | Source | Status |
|---|---|---|
| Production phone | `+17169938159` (purchased 2026-04-08) | Telnyx API (live), status `active` ✓ |
| Code fallback | `+17169938159` | [lib/telnyx.ts:21-22](lib/telnyx.ts:21) ✓ |
| Env override | `TELNYX_FROM_NUMBER` | [lib/telnyx.ts:22](lib/telnyx.ts:22), [lib/env.ts:19](lib/env.ts:19) ✓ |
| Messaging profile | `SnapQuote` (`40019d6e-d8b1-447b-8d8b-bdc03ca9ceab`) | Live, `enabled: true`, US whitelisted ✓ |
| Phone → profile | Bound to `40019d6e-d8b1-447b-8d8b-bdc03ca9ceab` | Live ✓ |
| **10DLC campaign** | **`messaging_campaign_id: null`** | Live (Telnyx API) — **NOT bound** ⚠ |

### Findings — Telnyx

- **CRITICAL** — **The 10DLC campaign is not bound to `+17169938159`.** Telnyx API confirms `messaging_campaign_id: null` on the phone number. This is the same condition documented in `docs/updates-log.md:366,382,394-395,545` from 2026-05-01: the campaign exists in Telnyx but the phone number is not assigned to it. Carriers therefore reject downstream A2P traffic from this number while the API call to Telnyx still returns success — meaning `quote.sent_via=["text"]` is recorded for sends that never reach the customer. **This is a customer-facing silent failure.** The fix requires manual action in the Telnyx Mission Control portal (Messaging → 10DLC → Campaigns → SnapQuote → Phone Numbers → assign `+17169938159`); the MCP cannot do it.

- **HIGH — Notion contradicts Notion.** The Bugs & Fixes page entry "Telnyx 10DLC SMS post-approval audit (no bug, validation pass)" at the top of the page reports the audit as a clean pass. The updates-log entry from 2026-05-01 describes the campaign as still unbound. Live Telnyx API agrees with updates-log, not Bugs & Fixes. The Bugs & Fixes entry is misleading and should be corrected to reflect that mobile code is fine but the carrier-side binding is still missing.

- **No drift between live phone number and code fallback.** Both are `+17169938159`. The 10DLC compliance footer logic (`ensureSmsOptOutFooter` in [lib/telnyx.ts:33-37](lib/telnyx.ts:33)) is correctly idempotent.

---

## Needs Murdoch's Decision

1. **Annual prices: which system is right?**
   Stripe: $191.99 (Team), $383.99 (Business). RevenueCat label: $189.99 (Team), $389.99 (Business). The actual ASC price is the iOS truth and I couldn't query it. **Open ASC manually, check the price set on `snapquote_team_annual` and `snapquote_business_annual`.** If ASC matches Stripe, the RC display labels need updating in the RC dashboard. If ASC matches the RC labels, **Stripe needs updating before launch** — otherwise web buyers and iOS buyers pay different amounts for the same plan, which is a customer-trust issue and a possible Apple compliance issue.

2. **The orphaned Stripe "Solo" product (`prod_UJqGrSk27Qgc0f`, $19.99/mo).** Should it be archived? It's not referenced in code; SOLO is the free tier. Risk if left alone: any future hand-rolled checkout against this product ID would charge a free-tier user. Recommend archiving in Stripe.

3. **Should `lib/stripe.ts` `monthlyPrice: "$19"` / `"$39"` be removed?** They're returned but not consumed by any UI today. Either delete them from the `StripePlanConfig` shape or fix them to `"$19.99"` / `"$39.99"` for defense in depth.

4. **`plan_config` table refactor — do it pre-launch or punt?** The Pending Work item discusses moving the seat limit out of TS+SQL duplication. Pre-launch is the cheapest moment; post-launch the duplication only bites when an org actually hits the limit. Murdoch's call.

5. **RevenueCat ASC API key — configure or skip?** RC reports `app_store_connect_api_key_configured: false` on the SnapQuote app. `subscription_key_configured: true`, so entitlements work. The ASC API key would let RC push product/metadata changes to ASC and read back screenshots/state. Not a launch blocker, but it removes a rough edge for any future RC-mediated product update.

---

## What I Couldn't Check

1. **App Store Connect MCP authentication is failing.** Every `mcp__app-store-connect__list_apps` call returns:
   > Provide a properly configured and signed bearer token, and make sure that it has not expired.

   Tried twice during this audit. The Notion Pending Work entry says ASC MCP was working in Claude Desktop on 2026-05-04 with key `Y8MMFHSC37`, but in this Claude Code session the bearer token is rejected. **Murdoch should regenerate the JWT or refresh the MCP server.** Until then I could not directly verify:
   - Live ASC subscription prices (the most important "needs decision" item above)
   - ASC product display names / localizations
   - ASC subscription group ordering (Pending Work item)
   - ASC App Privacy publish state
   - ASC bundle ID associations
   - In-app purchase review screenshots

   I worked around this by reading the values from Notion (Architecture & Stack, Decisions Log) and RevenueCat (which mirrors ASC product IDs). Where Notion and RevenueCat agree on a value (e.g. all 7 IAP product IDs, bundle ID `com.murdochmarcum.snapquote`), I'm confident; where they disagree (annual prices), I flagged it explicitly.

2. **Apple Sign-In Service ID for web Sign In with Apple.** Not visible to me from the mobile repo. Mobile uses bundle ID as the implicit Service ID for native Sign In with Apple — no separate Service ID required. If web Sign In with Apple is configured in Supabase Auth, the Service ID would live in Supabase dashboard under Authentication → Providers → Apple. Not queryable via MCP.

3. **RevenueCat entitlement → product attachment table.** `list-entitlements` returns the entitlement records but not the products attached to each. I confirmed all 4 subscription products are `state: active` and attached to packages in the current offering, which means they are reachable and grant entitlements at purchase time, but the explicit attachment edges weren't enumerated. To fully verify, run `get-products-from-entitlement` for both `entl4353fa7d61` (business) and `entlcac5098bbd` (team).

4. **Stripe product metadata for seats / credits.** The `list_products` response shows `description: null` on all real plans; metadata wasn't returned in the summary. If you want to confirm whether any Stripe product has hidden seat/credit metadata, run `fetch_stripe_resources` for each product ID — the metadata field will be populated there. None is referenced in code today, so this is informational.

5. **Web → mobile auth callback URL parity for SiwA + Google OAuth.** Mobile uses `redirectTo: "snapquotemobile://"` (`app/(auth)/login.tsx:107`, `app/(auth)/signup.tsx:113`); web likely uses `https://snapquote.us/auth/callback`. Both must be allowlisted as redirect URLs in Supabase Auth settings + Apple/Google OAuth provider settings. This is a Supabase dashboard setting, not visible from code.

6. **Stripe webhook secret rotation status.** Code references `STRIPE_WEBHOOK_SECRET` but the audit didn't query Stripe's webhook endpoint configuration to confirm the right URL is registered. Out of scope for this audit dimension.

---

## Appendix A — Live data snapshots used in this audit

### Stripe products (live)

```
prod_UJqGrSk27Qgc0f  Solo                       service  ⚠ orphan ($19.99/mo recurring)
prod_UJqGjUmWNMlSPQ  Snapquote Team Plan        service  $19.99/mo, $191.99/yr
prod_UJqGzwTrDYV1rs  Snapquote Business Plan    service  $39.99/mo, $383.99/yr
prod_UJqGlY2pkU4OQM  100 Lead Credits           service  $69.99 one-time
prod_UJqGTtLFlV1W0k  50 Lead Credits            service  $39.99 one-time
prod_UJqGjbjixP8YLM  10 Lead Credits            service  $9.99 one-time
prod_UJqGmM6Dd5QBWd  myproduct                  service  ⚠ stale CLI test
prod_UJqGK24B9qyheX  myproduct                  service  ⚠ stale CLI test
prod_UJqGSUc7XwabDp  myproduct                  service  ⚠ stale CLI test
prod_UJqGqAMI4BrUhQ  myproduct                  service  ⚠ stale CLI test
prod_UJqGRdcUm63JMy  myproduct                  service  ⚠ stale CLI test
prod_UJqGBspoUzLwrT  myproduct                  service  ⚠ stale CLI test
```

### RevenueCat offerings (live)

```
ofrng501c015567  default (current)  4 packages  → 4 subscription products (active)
ofrngc64641c4d6  credits            3 packages  → 3 consumable products (active)
```

### RevenueCat package display labels (potential drift sources)

```
business_annual    "Business Annual - $389.99/yr"   ⚠ vs Stripe $383.99
business_monthly   "Business Monthly - $39.99/mo"   ✓
team_annual        "Team Annual - $189.99/yr"       ⚠ vs Stripe $191.99
team_monthly       "Team Monthly - $19.99/mo"       ✓
credits_10         "10 Credits - $9.99"             ✓
credits_50         "50 Credits - $39.99"            ✓
credits_100        "100 Credits - $69.99"           ✓
```

### Telnyx (live)

```
Phone:           +17169938159  (active, purchased 2026-04-08)
Messaging profile: SnapQuote (40019d6e-d8b1-447b-8d8b-bdc03ca9ceab, enabled, US-only)
10DLC campaign:  messaging_campaign_id: null   ⚠ NOT BOUND
```

### Resend (live)

```
Domain:  snapquote.us   verified, sending enabled, region us-east-1
```

### Supabase (live)

```
Project: upqvbdldoyiqqshxquxa  status ACTIVE_HEALTHY  region us-west-2
plan_config table: does not exist
accept_invite_token RPC: SOLO=1, TEAM=2, BUSINESS=5 (else)  matches lib/plans.ts
```

---

*End of report.*
