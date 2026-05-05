# ASC ↔ RevenueCat Final Alignment Verification

**Date:** 2026-05-04 (verified late evening into 2026-05-05 UTC)
**Scope:** Live verification of ASC vs RevenueCat for the four SnapQuote subscriptions. Stripe is being handled separately by claude.ai with write scope — not touched here.
**Source of truth:** App Store Connect.
**Mode:** Read-only.

---

## TL;DR

| Product | ASC US `customerPrice` | RC dashboard `display_name` | Match? |
|---|---|---|---|
| `snapquote_team_monthly` | **$19.99/mo** | "Team Monthly - $19.99/mo" | ✅ |
| `snapquote_team_annual` | **$191.99/yr** | "Team Annual - $189.99/yr" | ❌ ($2 too low — cosmetic) |
| `snapquote_business_monthly` | **$39.99/mo** | "Business Monthly - $39.99/mo" | ✅ |
| `snapquote_business_annual` | **$384.99/yr** | "Business Annual - $389.99/yr" | ❌ ($5 too high — cosmetic) |

**Is the RC label drift a real problem? No.** Reasoning in §3.

**ASC↔RC linkage:** clean. No orphans, all four subscriptions correctly attached to their entitlements.

**Mobile runtime path:** verified — UI reads `pkg.product.priceString` from Apple StoreKit at render time. RC `display_name` never reaches the user.

**Verdict for moving to Audit 2:** **GO**.

One non-blocking item worth Murdoch's attention before Audit 2: the ASC subscription `groupLevel` ordering doesn't match the preference recorded in Notion Pending Work. Details in §6.

---

## §1 — ASC live state (all four subscriptions)

Pulled directly from `GET /v1/subscriptions/{id}` and `/v1/subscriptions/{id}/prices?filter[territory]=USA` using the patched ASC MCP credentials. Results:

| Field | team_monthly | team_annual | business_monthly | business_annual |
|---|---|---|---|---|
| Sub ID | 6761979395 | 6761979761 | 6761980155 | 6761980313 |
| `productId` | snapquote_team_monthly | snapquote_team_annual | snapquote_business_monthly | snapquote_business_annual |
| `name` | Team Monthly | Team Annual | Business Monthly | Business Annual |
| `subscriptionPeriod` | ONE_MONTH | ONE_YEAR | ONE_MONTH | ONE_YEAR |
| `state` | READY_TO_SUBMIT | READY_TO_SUBMIT | READY_TO_SUBMIT | READY_TO_SUBMIT |
| `customerPrice` (USD) | **$19.99** | **$191.99** | **$39.99** | **$384.99** |
| `proceeds` (USD) | $16.99 | $163.19 | $33.99 | $327.24 |
| `familySharable` | false | false | false | false |
| `groupLevel` | 4 | 3 | 2 | 1 |
| `reviewNote` | null | null | null | null |
| Territories priced | 175 | 175 | 175 | 175 |

**All four match the canonical values exactly.** No drift inside ASC. Each subscription has Apple's full international territory roster (175 territories) populated with equalized regional prices.

**Subscription group:** `22024834` "SnapQuote Plans". One localization (en-US, `state: PREPARE_FOR_SUBMISSION`).

**Per-subscription localizations (sanity check on `team_annual`):** one en-US localization, `name: "Team Annual"`, `description: "20 lead credits per month, 2 seats. Annual plan."`, `state: PREPARE_FOR_SUBMISSION`. Looks reasonable.

---

## §2 — RevenueCat live state

Pulled via the RC MCP for project `proj39ead10c`.

### Offering `default` (current, "SnapQuote Plans")

| Package | `lookup_key` | RC `display_name` | Linked product | Product `state` | `store_identifier` |
|---|---|---|---|---|---|
| `pkged9b1f70df1` | business_annual | **"Business Annual - $389.99/yr"** ⚠ | `prodeb883ca8be` | active | `snapquote_business_annual` |
| `pkge43063f0a99` | business_monthly | "Business Monthly - $39.99/mo" | `prodbbf38a07e8` | active | `snapquote_business_monthly` |
| `pkge7bd053bb8f` | team_annual | **"Team Annual - $189.99/yr"** ⚠ | `prod229f7b292e` | active | `snapquote_team_annual` |
| `pkge53a48d3f02` | team_monthly | "Team Monthly - $19.99/mo" | `prod8f1c98f570` | active | `snapquote_team_monthly` |

### Entitlements (live)

| Entitlement ID | `lookup_key` | `display_name` | Attached products |
|---|---|---|---|
| `entl4353fa7d61` | `business` | "Business" | `business_monthly` + `business_annual` |
| `entlcac5098bbd` | `team` | "Team" | `team_monthly` + `team_annual` |

### What's correct

- **All four subscriptions exist in RC** with `store_identifier` exactly matching the ASC product IDs. No orphans on either side.
- **Entitlement attachments are right:** Business plans → `business`; Team plans → `team`. Lowercase (matches mobile code at `lib/revenuecat.ts:67-68`).
- **Mobile code expects exactly these entitlement names:** verified at `lib/revenuecat.ts`, `app/(tabs)/more/plan.tsx`. Casing matches.
- **All RC products are `state: active`.** No archived items still attached. No Android-side products configured (RC Android key isn't provisioned — by design, see Notion Decisions Log "Mobile is iOS-first").
- **3 consumable products** (10/50/100 credit packs) attached to a separate `credits` offering. Their RC labels match ASC ($9.99 / $39.99 / $69.99). Out of scope for this task but cleanly aligned.

### What's stale

- `team_annual` package `display_name` is **"$189.99/yr"** — ASC charges **$191.99/yr** ($2 too low in label).
- `business_annual` package `display_name` is **"$389.99/yr"** — ASC charges **$384.99/yr** ($5 too high in label).

These are the same two labels flagged in Audit 1. Murdoch confirmed RC has no UI/MCP path to edit them (RC staff publicly state they're dashboard-convenience only and not user-facing). The RC MCP tool surface confirms this — there is no `update-package` operation; available updates target offerings, entitlements, products, virtual currencies, webhooks — never package metadata.

---

## §3 — Is the RC label drift a real problem? **No.**

**Strict reading:** the two stale `display_name` strings are visible in exactly one place: the RC web dashboard at `https://app.revenuecat.com/projects/proj39ead10c/offerings`. Nothing else reads them.

Concretely:
1. **Customers never see them.** Mobile renders prices from `pkg.product.priceString` ([app/(tabs)/more/plan.tsx:575](C:/Users/murdo/SnapQuote-mobile/app/(tabs)/more/plan.tsx) and [app/(tabs)/more/credits.tsx:253](C:/Users/murdo/SnapQuote-mobile/app/(tabs)/more/credits.tsx)) — Apple's StoreKit-localized price string fetched at render time. That string comes from ASC, not RC. A customer in the US opening the paywall sees "$191.99/yr" / "$384.99/yr" regardless of what RC's `display_name` says.
2. **Apple doesn't see RC.** App Review pulls only ASC product metadata. RC dashboards are not part of the submission package or any reviewer-visible artifact.
3. **No code reads RC `display_name`.** Grepping the mobile repo for `display_name`, `displayName`, `pkg.identifier`, etc. returns nothing that wires the RC label into any user-facing or backend surface. The two product-ID references found in mobile code (`app/(tabs)/more/plan.tsx`, `app/(tabs)/more/credits.tsx`) are for matching packages by `product.identifier`, not consuming any cosmetic label.
4. **No backend consumer.** The web `/api/iap/sync` endpoint (called from mobile after a purchase) takes Apple's transaction data — `transactionIdentifier`, `productIdentifier`, `purchaseDate` — and writes the org's plan based on the entitlement granted, not the RC label.
5. **No analytics dependency.** Sentry, Meta Pixel, GA4 are all web-side and don't touch RC labels.

The only surface where the drift is visible is **internal cross-system audits** — and that's a documentation problem we've already solved with the Decisions Log entry "Pricing source of truth: ASC" plus the Pending Work / Bugs & Fixes entries that explicitly call out the labels as expected-stale.

**Recommendation: leave as-is.** Don't burn a launch-blocker slot on it. Optionally, when you're next in the RC dashboard for any reason, fix the two labels in 15 seconds — but it's not on the critical path and it has zero customer-facing impact.

---

## §4 — Mobile runtime path verification

Searched mobile repo for hardcoded prices and the `priceString` runtime call:

**Found exactly two `pkg?.product.priceString` reads** (both authoritative for what users see):
- `app/(tabs)/more/plan.tsx:575` — paywall plan card price
- `app/(tabs)/more/credits.tsx:253` — credit pack price

**No hardcoded customer-facing prices** in any non-Markdown mobile file. Grep for `$19.99`, `$39.99`, `$191.99`, `$384.99`, `$189.99`, `$389.99` returned zero matches in `.ts`/`.tsx`/`.json`. The only places those strings exist in the mobile repo are `docs/updates-log.md` and `docs/current-state.md` (engineering log), never in code.

**Product ID references in mobile code** (the strings that Apple's StoreKit + RC use to identify products):
- `app/(tabs)/more/plan.tsx` — explicit hardcoded `snapquote_team_monthly|annual` and `snapquote_business_monthly|annual` strings used to map plan + interval → RC package (`findPackage` helper). These are product IDs, not prices, so they intentionally don't change.
- That's it. No other mobile code references the IDs (other than docs).

**Conclusion:** the mobile UI cannot accidentally show an RC `display_name` value because no code path reads it. The runtime price chain is `Apple StoreKit → RC `pkg.product` → `priceString` → UI`. RC `display_name` sits parallel to that chain and never touches it.

---

## §5 — ASC ↔ RC linkage matrix

| ASC product | ASC sub state | RC product ID | RC `store_identifier` | RC entitlement | Match |
|---|---|---|---|---|---|
| `snapquote_team_monthly` | READY_TO_SUBMIT | `prod8f1c98f570` | `snapquote_team_monthly` | `team` | ✅ |
| `snapquote_team_annual` | READY_TO_SUBMIT | `prod229f7b292e` | `snapquote_team_annual` | `team` | ✅ |
| `snapquote_business_monthly` | READY_TO_SUBMIT | `prodbbf38a07e8` | `snapquote_business_monthly` | `business` | ✅ |
| `snapquote_business_annual` | READY_TO_SUBMIT | `prodeb883ca8be` | `snapquote_business_annual` | `business` | ✅ |

No orphans. No mis-assigned entitlements. RC's view of ASC matches the SnapQuote app exactly.

---

## §6 — Sanity check: other ASC/RC issues

Most of these are flags for Audit 2 (App Store submission readiness), not blockers for this alignment task. Listed in priority order:

1. **`groupLevel` ordering doesn't match the documented preference.** Current order:
   - L1 = Business Annual
   - L2 = Business Monthly
   - L3 = Team Annual
   - L4 = Team Monthly

   Notion Pending Work item ("Reorder subscription levels in App Store Connect (manual)") records the desired order as:
   - L1 = Business Monthly
   - L2 = Business Annual
   - L3 = Team Monthly
   - L4 = Team Annual

   So the current state has tier-correct ordering (Business above Team) but Annual-above-Monthly within each tier, while the doc'd preference puts Monthly above Annual within each tier. **Either the current state is what you actually want and the Pending Work doc is wrong, or the manual reorder is still TODO.** Apple's `groupLevel` controls upgrade/downgrade classification — moving up = immediate proration, moving down = deferred to billing-period end. Different orderings produce different upgrade UX. Quick decision needed; not a launch blocker.

2. **No review notes set on any subscription** (`reviewNote: null` × 4). Apple typically doesn't strictly require notes for standard tier subs, but if review screenshots aren't sufficient, a note pointing the reviewer at demo credentials saves a back-and-forth. **Audit 2 territory.**

3. **All 4 subscription localizations are `state: PREPARE_FOR_SUBMISSION`** with only en-US locale. Normal pre-submit state for a US-only launch. Not a blocker for v1.0; would need additional locales for an EU rollout (separate Pending Work item — Digital Services Act).

4. **Subscription group localization is also `PREPARE_FOR_SUBMISSION`** with name "SnapQuote Plans" (en-US only). Same deal — fine for US-only v1.0.

5. **`familySharable: false` on all four** — deliberate marketing call. Not a config issue, just noting it for completeness.

6. **All four products have full territory pricing** (175 territories each). Apple's standard equalized pricing is in place. Not a blocker.

7. **No archived/orphaned RC products attached to current packages.** Clean.

8. **The two stale RC labels are documented in Notion** (Bugs & Fixes "RC display labels stale across both annual plans" entry, saved earlier today). No action needed beyond what's already there.

**Out-of-scope items deferred to Audit 2** (per task instructions, just flagging readiness):
- App Privacy publish state
- Required iPhone 6.5" screenshots (3 minimum)
- App subtitle / promotional text (optional but recommended)
- Apple Sign-In Service ID config (Supabase dashboard — separate audit)
- DSA EU compliance toggle
- Demo data seeding for `demo@snapquote.us` reviewer account

These are tracked in Notion Pending Work and unchanged by this verification.

---

## §7 — Go/no-go for Audit 2

**GO.**

The ASC↔RC alignment is in good shape:
- All four ASC prices match the canonical source-of-truth values.
- All four ASC subscriptions are configured (READY_TO_SUBMIT), with full international territory pricing, English localizations, and correct grouping.
- All four RC products are correctly linked to their ASC counterparts, attached to the right entitlements (`team` / `business` lowercase, matching mobile code casing exactly).
- Mobile runtime path uses ASC prices via `pkg.product.priceString`. RC `display_name` is never user-facing.
- Stripe is being handled separately by claude.ai — not touched here.

The only ASC item that still needs Murdoch's attention before submission is the manual `groupLevel` reorder (item #1 in §6) — and even that may be moot if you're satisfied with the current ordering. It's a UX choice, not a correctness issue.

The two stale RC labels are cosmetic-only and can be safely deferred indefinitely or fixed in 30 seconds whenever you're next in the RC dashboard.

Audit 2 (App Store submission readiness) can run with the current state as a clean baseline.

---

*End of report.*
