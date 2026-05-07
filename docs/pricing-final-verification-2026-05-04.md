# Pricing Final Verification — ASC ↔ Stripe (post-Vercel-env-update)

**Date:** 2026-05-04 → 2026-05-05 (verified after Murdoch updated Vercel `NEXT_PUBLIC_STRIPE_BUSINESS_ANNUAL_PRICE_ID` and Vercel auto-redeployed)
**Mode:** Read-only.
**Scope:** Final cross-system verification that ASC and Stripe now charge the same price for every SnapQuote subscription plan. RC labels remain stale-but-non-user-facing (documented earlier; out of scope for this verification).

---

## TL;DR

| Plan | ASC `customerPrice` | Stripe price | Stripe price ID | Match? |
|---|---|---|---|---|
| Team Monthly | $19.99/mo | $19.99/mo (1999¢) | `price_1TLCZnFNX8cpZFmwZeXOL63t` | ✅ |
| Team Annual | $191.99/yr | $191.99/yr (19199¢) | `price_1TLCZmFNX8cpZFmwTFjEf313` | ✅ |
| Business Monthly | $39.99/mo | $39.99/mo (3999¢) | `price_1TLCZdFNX8cpZFmwokht9uyb` | ✅ |
| Business Annual | $384.99/yr | $384.99/yr (38499¢) | **`price_1TTpUuFNX8cpZFmwUMWMg77W`** | ✅ |

**Final verdict: YES — pricing is fully aligned across ASC and Stripe.**

One non-blocking follow-up: the old $383.99 Business Annual price (`price_1TLCZcFNX8cpZFmw0HVXNHwm`) is **still active** in Stripe (not yet archived). No production code path references it any longer, so it cannot be charged to a new customer — but it should be archived for hygiene. Flagged for Murdoch.

---

## §1 — Live Stripe state

Pulled via `mcp__1a7419b9-...__list_prices` for both products and `search_stripe_resources` for active-state confirmation.

### Team product (`prod_UJqGjUmWNMlSPQ` — "Snapquote Team Plan")

| Price ID | Amount | Currency | Type | Recurring | Active |
|---|---|---|---|---|---|
| `price_1TLCZnFNX8cpZFmwZeXOL63t` | 1999 | usd | recurring | month | yes |
| `price_1TLCZmFNX8cpZFmwTFjEf313` | 19199 | usd | recurring | year | yes |

### Business product (`prod_UJqGzwTrDYV1rs` — "Snapquote Business Plan")

| Price ID | Amount | Currency | Type | Recurring | Active | Notes |
|---|---|---|---|---|---|---|
| `price_1TTpUuFNX8cpZFmwUMWMg77W` | **38499** | usd | recurring | year | **yes** | NEW — created 2026-05-04 via claude.ai Stripe MCP, this is now the canonical Business Annual |
| `price_1TLCZdFNX8cpZFmwokht9uyb` | 3999 | usd | recurring | month | yes | Business Monthly, unchanged |
| `price_1TLCZcFNX8cpZFmw0HVXNHwm` | **38399** | usd | recurring | year | **yes — still active** ⚠ | OLD ($383.99/yr). Should be archived. No code references it. |

Confirmation that the old price is still active: `prices:product:"prod_UJqGzwTrDYV1rs" AND active:"false"` returned `{results:[]}` — i.e., zero archived prices on this product. The active-true query returned all three Business prices, including the old one.

---

## §2 — Vercel deploy verification

Pulled via `list_deployments` for project `prj_9Z7T6lgKutlpfapplWbQo8JmJVbi` (team `team_0kIxSIiTWFytVpdXe22QrXl4`).

Sequence of events around the env-var update:

| Deployment ID | Created (epoch ms) | Commit | Action | State | Target |
|---|---|---|---|---|---|
| `dpl_5Qjf8C5fgvvrZtZfQZvfXBidGsxt` | 1778013363928 | `3043719` | initial git push deploy | READY | production |
| **`dpl_HBc2NpAUewErcJkuyLeKaBGL9LQM`** | **1778013911221** | `3043719` | **`redeploy`** (originalDeploymentId = `dpl_5Qjf...`) | **READY** | **production** |
| `dpl_9TVBMZWPbMiq2efk6uLqq9MCqwN5` | 1778014354471 | `60cc2c5` (unrelated, "remove stale subscription gate from quote send route") | new commit | BUILDING | production |

The middle row is the one that matters: about 9 minutes after the initial deploy of commit 3043719, Vercel produced a second deployment of the **same commit** with `meta.action: "redeploy"` and `meta.originalDeploymentId` pointing at the first deploy. That's exactly the signature of a manual "Redeploy" button click in the Vercel dashboard, which is the standard way to pick up an env var change — confirming Murdoch updated `NEXT_PUBLIC_STRIPE_BUSINESS_ANNUAL_PRICE_ID` between the two deploys and triggered the redeploy.

The redeploy reached `state: READY` cleanly. Production is now serving commit 3043719 with the new env var baked into the client bundle.

(I did not pull build logs to confirm the literal `NEXT_PUBLIC_STRIPE_BUSINESS_ANNUAL_PRICE_ID` value the build saw — Vercel doesn't echo env var values to build logs by design, and `NEXT_PUBLIC_*` values are inlined into the client JS bundle without log output. The READY redeploy after the env change is sufficient evidence that the new value is live; if you want belt-and-suspenders, opening snapquote.us/app/plan in incognito and clicking Business Annual will land in Stripe Checkout showing $384.99/yr.)

---

## §3 — Repo sanity check

`grep "$383.99"` across both repos:

**Web (`C:\Users\murdo\SnapQuote`):** zero matches in any code file (`.ts`, `.tsx`, `.json`). All 17 matches are in `docs/` files — `updates-log.md` (historical session entries), `pricing-alignment-2026-05-04.md` (in-flight report from earlier today), and `audit-1-data-integrity-2026-05-04.md` (Audit 1 record). These are append-only / historical artifacts that intentionally describe the state at the time of writing and should not be retroactively edited.

**Mobile (`C:\Users\murdo\SnapQuote-mobile`):** zero matches anywhere — confirmed mobile reads `pkg.product.priceString` from ASC at runtime and never had a hardcoded reference.

Code is clean. Commit `3043719` removed the only two code references (`components/plan/PlanOptionsSection.tsx:64`, `app/app/plan/page.tsx:29`).

---

## §4 — Final cross-reference table

| Plan | ASC price | Stripe price | Stripe price ID | Match? |
|---|---|---|---|---|
| Team Monthly | $19.99/mo | $19.99/mo | `price_1TLCZnFNX8cpZFmwZeXOL63t` | ✅ |
| Team Annual | $191.99/yr | $191.99/yr | `price_1TLCZmFNX8cpZFmwTFjEf313` | ✅ |
| Business Monthly | $39.99/mo | $39.99/mo | `price_1TLCZdFNX8cpZFmwokht9uyb` | ✅ |
| Business Annual | $384.99/yr | $384.99/yr | `price_1TTpUuFNX8cpZFmwUMWMg77W` | ✅ |

All four match. ASC values are the canonical source-of-truth as declared in the Decisions Log entry "Pricing source of truth: ASC for all plans" (2026-05-04). Stripe is now in lockstep.

---

## §5 — Outstanding items

These do not affect alignment correctness; flagged for hygiene.

1. **Old Stripe price `price_1TLCZcFNX8cpZFmw0HVXNHwm` is still active.** Zero subscriptions on it (verified at swap time per the earlier work session). Nothing references it: `.env.local`, Vercel production env, `lib/stripe.ts`, and both UI strings all point at the new price. But leaving it active in Stripe creates two minor risks: (a) if anyone ever hand-rolls a Stripe Checkout against this product, Stripe could choose either price; (b) audit-trip noise — future cross-system audits will see two recurring-yearly prices on the Business product and have to ask which is canonical. Recommend archiving (set `active=false`) via Stripe dashboard or claude.ai's write-scope MCP.
2. **RC dashboard `display_name` labels for `team_annual` ("$189.99/yr") and `business_annual` ("$389.99/yr") remain stale** — out of scope for this verification, documented in `docs/asc-rc-final-alignment-2026-05-04.md`. Non-user-facing per RC; mobile reads ASC at runtime. Cosmetic-only.

---

## §6 — Final verdict

**Pricing is fully aligned across ASC and Stripe — yes.** Closing pricing alignment as DONE.

The Pending Work entry "PENDING: Vercel env var update for new Stripe Business Annual price" can be marked RESOLVED.

---

*End of report.*
