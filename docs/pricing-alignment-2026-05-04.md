# Pricing Alignment — Cross-System Reconciliation

**Date:** 2026-05-04 → 2026-05-05
**Scope:** SnapQuote subscription prices across App Store Connect, Stripe, and RevenueCat. Resolves Audit 1's CRITICAL annual-price-drift finding.
**Source of truth:** **App Store Connect** (per Decisions Log entry of same date).
**Author:** Claude Code

---

## Canonical prices (US territory)

| Product | ASC `customerPrice` (USD) | Period |
|---|---|---|
| `snapquote_team_monthly` | **$19.99/mo** | ONE_MONTH |
| `snapquote_team_annual` | **$191.99/yr** | ONE_YEAR |
| `snapquote_business_monthly` | **$39.99/mo** | ONE_MONTH |
| `snapquote_business_annual` | **$384.99/yr** | ONE_YEAR |

Pulled live from `GET /v1/subscriptions/{id}/prices?filter[territory]=USA` after the ASC MCP 19m patch landed. Subscription group `22024834` ("SnapQuote Plans"), all four products `state: READY_TO_SUBMIT`.

---

## State of each system after this session

### App Store Connect — ✅ canonical, no changes
All four prices stand as listed. ASC is now declared canonical. No edits performed in ASC during this session — by design.

### Stripe — ⚠️ Business Annual still drifted; manual fix required
- Team Monthly: ✅ $19.99 matches ASC (`price_1TLCZnFNX8cpZFmwZeXOL63t`)
- Team Annual: ✅ $191.99 matches ASC (`price_1TLCZmFNX8cpZFmwTFjEf313`)
- Business Monthly: ✅ $39.99 matches ASC (`price_1TLCZdFNX8cpZFmwokht9uyb`)
- Business Annual: ❌ **$383.99 vs ASC $384.99 — $1/year drift**, still present (`price_1TLCZcFNX8cpZFmw0HVXNHwm`, 38399¢)

**Why no auto-fix:** the Stripe MCP API key in scope is read-only. Calling `PostPrices` returns:
> Your API key does not have the required permissions for 'PostPrices'.

Per the task constraint ("if any task fails or hits a permission wall, complete the rest, report the blocker, and do NOT keep retrying"), I stopped after one attempt and prepared the manual instructions below.

### RevenueCat — ⚠️ both annual `display_name` labels stale; manual fix required
| Package | `display_name` (live) | Should be |
|---|---|---|
| `pkge53a48d3f02` `team_monthly` | "Team Monthly - $19.99/mo" | ✅ correct |
| `pkge7bd053bb8f` `team_annual` | **"Team Annual - $189.99/yr"** | "Team Annual - **$191.99/yr**" |
| `pkge43063f0a99` `business_monthly` | "Business Monthly - $39.99/mo" | ✅ correct |
| `pkged9b1f70df1` `business_annual` | **"Business Annual - $389.99/yr"** | "Business Annual - **$384.99/yr**" |

**Why no auto-fix:** The available RevenueCat MCP tool surface (project `proj39ead10c`) does not expose an `update-package` operation. Package `display_name` is editable only from the RC dashboard.

**Customer-facing impact: zero.** Mobile reads `pkg.product.priceString` from ASC at runtime (`app/(tabs)/more/plan.tsx:575`), so iOS users see ASC's actual price. The RC labels are dashboard cosmetics only; they trip cross-system audits but don't reach the user.

### ASC MCP server — ✅ patch made permanent
- Local npx cache patch (`...\_npx\6d4abb06db0c196c\node_modules\appstore-connect-mcp-server\src\services\auth.ts` and `dist/src/services/auth.js`) — `'20m'` → `'19m'`. Already applied earlier today; survives current session but vulnerable to npx cache eviction.
- **New:** Global install at `C:\Users\murdo\AppData\Roaming\npm\node_modules\appstore-connect-mcp-server\` (`npm install -g appstore-connect-mcp-server@1.1.3`). Same patch applied to both `dist/src/services/auth.js` and `src/services/auth.ts` in the global install.
- **New:** `claude_desktop_config.json` `app-store-connect` entry updated to invoke the global install directly. Old `args: ["/c", "npx", "-y", "appstore-connect-mcp-server"]` (cmd + npx + cache) replaced with `command: "node", args: ["C:\\Users\\murdo\\AppData\\Roaming\\npm\\node_modules\\appstore-connect-mcp-server\\dist\\src\\index.js"]`. Env vars (`KEY_ID`, `ISSUER_ID`, `P8_PATH`) unchanged.
- After the next Claude Desktop restart, the patched global install handles all ASC MCP traffic. The npx cache copy is now redundant but harmless.

---

## What requires Murdoch's manual action

Two items, both blocked at the third-party MCP permission layer. Both are dashboard-only flows.

### 1. Stripe — fix Business Annual price ($383.99 → $384.99)

Stripe dashboard: https://dashboard.stripe.com/products/prod_UJqGzwTrDYV1rs

Stripe prices are **immutable**, so the flow is create-new + archive-old. Existing Business Annual subscribers stay grandfathered on the old $383.99 price automatically; only new checkouts use the new price.

1. **Create new price** under the existing "Snapquote Business Plan" product:
   - `unit_amount = 38499` (cents)
   - `currency = usd`
   - `recurring.interval = year`
   - `active = true`
   - Copy the new price ID — looks like `price_1...`.
2. **Archive old price** `price_1TLCZcFNX8cpZFmw0HVXNHwm` (set `active = false`). Existing subscribers are unaffected.
3. **Update Vercel env var** `NEXT_PUBLIC_STRIPE_BUSINESS_ANNUAL_PRICE_ID` to the new price ID. Trigger a redeploy.
4. **Optionally update the cosmetic UI string** in `components/plan/PlanOptionsSection.tsx:64` from `"billed $383.99/yr"` → `"billed $384.99/yr"`. Not strictly required (the actual checkout uses Stripe's price object), but keeps the displayed string honest.

Code search confirmed there are **no hardcoded references** to the old price ID anywhere in the web repo — only the env var indirection point. The old price ID appears only in `docs/audit-1-data-integrity-2026-05-04.md` (audit report, fine to leave). No other code edits needed beyond the optional cosmetic string above.

### 2. RevenueCat — fix two annual `display_name` labels

RC dashboard: https://app.revenuecat.com/projects/proj39ead10c/offerings

1. Open offering `default` ("SnapQuote Plans").
2. Edit package `team_annual` → change display name from `"Team Annual - $189.99/yr"` to `"Team Annual - $191.99/yr"`.
3. Edit package `business_annual` → change display name from `"Business Annual - $389.99/yr"` to `"Business Annual - $384.99/yr"`.
4. Save. No app rebuild needed — labels are server-side dashboard metadata. (And `display_name` doesn't reach the customer either way.)

### 3. Restart Claude Desktop (covers Task C)
After restart, the ASC MCP will spawn from the global install at `C:\Users\murdo\AppData\Roaming\npm\node_modules\appstore-connect-mcp-server\dist\src\index.js` with the patched `expiresIn: '19m'` JWT generation. To verify, call `mcp__app-store-connect__list_apps` — should still return SnapQuote (App ID 6761979056). Will be the case across npx cache evictions and `npx` upgrades from now on.

---

## Notion updates saved

All in-lane edits to `[Source: Claude Code]` entries only. No other-source entries touched.

1. **Decisions Log** — new entry at top of `## Decisions to date`: `### [2026-05-04] [Source: Claude Code] — Pricing source of truth: ASC for all plans`. Lists the four canonical prices and the propagation rule.
2. **Architecture & Stack** — new section inserted after `## Integrations Pending`: `## [Source: Claude Code] — Pricing canonical source (verified 2026-05-04)`. Includes the canonical prices, propagation rule, and the verification path (which MCPs to query).
3. **Bugs & Fixes** — two new entries at top of dated section:
   - `### [2026-05-04] [Source: Claude Code] — RC display labels stale across both annual plans (Team Annual $189.99, Business Annual $389.99 vs ASC $191.99 / $384.99)`
   - `### [2026-05-04] [Source: Claude Code] — Stripe Business Annual drifted $1 below ASC ($383.99 vs $384.99)`
   Both include the manual dashboard steps for Murdoch and the in-flight blocker note.
4. **Pending Work** — existing `[2026-05-04] [Source: Claude Code] — ASC API key Y8MMFHSC37 is rejected by Apple…` entry updated with a `RESOLVED 2026-05-04` marker at the top noting the real fix was the JWT 19m patch and the entry can be archived.

The earlier Bugs & Fixes "ASC MCP returns 401" entry already has its CORRECTION marker (added in the same session that diagnosed the JWT exp-window root cause).

---

## Cross-source comparison table (post-session state)

| Source | Team Monthly | Team Annual | Business Monthly | Business Annual |
|---|---|---|---|---|
| **ASC** (canonical) | $19.99/mo | $191.99/yr | $39.99/mo | $384.99/yr |
| **Stripe** | $19.99 ✅ | $191.99 ✅ | $39.99 ✅ | $383.99 ❌ ($1 low) |
| **RevenueCat label** | $19.99/mo ✅ | **$189.99/yr** ❌ ($2 low) | $39.99/mo ✅ | **$389.99/yr** ❌ ($5 high) |
| **Web UI string** (`PlanOptionsSection.tsx`) | $19.99/mo | $191.99/yr (line 53) | $39.99/mo | $383.99/yr (line 64) ❌ |
| **`lib/stripe.ts`** label | "$19" (vestigial, unused — Audit 1 HIGH) | n/a | "$39" (vestigial, unused — Audit 1 HIGH) | n/a |
| **Mobile `pkg.product.priceString`** | reads ASC | reads ASC | reads ASC | reads ASC |

Once Murdoch completes the manual Stripe + RC fixes, the table collapses to all-ASC across all rows.

---

## Is the SnapQuote pricing now consistent across ASC, Stripe, and RC?

**Not yet — two manual dashboard fixes remain (Stripe Business Annual $383.99 → $384.99, RC annual display labels), both unblocking once Murdoch performs the documented dashboard steps.** Everything I could fix programmatically is fixed, including the ASC MCP permanence patch.

---

*End of report.*
