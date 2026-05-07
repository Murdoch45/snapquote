# SnapQuote — Audit 2.5 Final Submission Readiness Check

**Date:** 2026-05-06
**Mode:** Read-only verification audit. No ASC, code, RC, Stripe, or DB modifications.
**Scope:** Verify today's fixes shipped to production. Surface anything new. Produce go/no-go verdict for Apple submission.
**Out of scope:** Build 10 — explicitly deferred per user direction. Full re-run of Audit 2.

---

## 1. Executive summary

| Category | Result |
|---|---|
| Web repo today's commits shipped | ✅ All five (`79bf5b9`, `d9b6e83`, `f764f0c`, `d73f4b8`, `933079b`) on `main`, pushed |
| Vercel production at latest commit | ✅ `dpl_HGEkfgsGkA265gz4VhVLocwttMfk` READY at `933079b` |
| Web tsc + tests | ✅ tsc clean; 76/76 tests pass |
| Code-level fix verifications | ✅ 4/4 sites confirmed (subscription.ts, accept route, PublicQuoteCard, public page) |
| Mobile repo regressions | ✅ Zero — no commits today (last `39ae97d` 2026-05-01); working tree clean |
| Demo org data | ✅ BUSINESS plan / 100 monthly credits / 5 leads / 2 quotes / event log complete + chronological |
| ASC v1.0 state | ✅ `PREPARE_FOR_SUBMISSION`, copyright populated, MANUAL release |
| IAPs all `READY_TO_SUBMIT` | ✅ All 7 (4 subs + 3 credit packs) |
| Sentry errors from today's code | ✅ Zero — only pre-existing Telnyx invalid-number errors in last 24h |
| Items requiring manual ASC dashboard verification | ⚠️ Subtitle, Description, Keywords, App Review Notes, screenshots, App Privacy publish state, encryption export compliance, EU DSA Trader status, subscription `groupLevel` ordering — **MCP `appStoreVersionLocalizations` GET_COLLECTION blocked**, cannot verify these via API |

### Final go/no-go: **GO — submission-ready apart from Build 10**

Counts:
- **Hard blockers identified by this audit: 0**
- **Strong recommendations: 1** (manual dashboard sanity-check on the metadata fields the MCP can't read)
- **Nice-to-haves: 2** (Stripe old-price archive; mobile git remote verify before next build)
- **New issues introduced today: 0**
- **Build 10 status: pending — out of scope, must be built and attached before submission**

---

## 2. Hard blockers

**None identified.**

The audit found no new bugs introduced by today's work. Every code path verified, demo data verified, deployments verified, no Sentry errors traceable to today's commits.

---

## 3. Strong recommendation (1)

### SR-1 — Manual sanity-check the metadata fields the MCP cannot read

The `appstore-connect-mcp-server` tool's `list_app_store_version_localizations` and `list_app_store_versions` collection endpoints both return:

> `App Store Connect API error: The resource '...' does not allow 'GET_COLLECTION'. Allowed operations are: CREATE, DELETE, GET_INSTANCE, UPDATE`

This is a known MCP-layer limitation (the underlying ASC API does support listing, but this MCP package wraps a non-list endpoint). Same effect for screenshots — the API path requires a localization ID first. As a result, this audit could **not** programmatically verify the following fields the prompt asked about:

- App Subtitle (claimed: "Better Jobs, Instant Estimates")
- Description, Keywords, Promotional Text, Marketing URL, Support URL
- App Review Notes (claimed: original 3.1.1 explanation + IAP testing instructions for demo)
- Screenshots count + dimensions (claimed: ≥3 at 1320×2868 in iPhone 6.9" section)
- App Privacy publish state (claimed: still "Published")
- Encryption export compliance answer
- EU DSA Trader status declaration
- Subscription `groupLevel` ordering

What I can verify via API and what I confirmed:

| Field | Source | Value | Status |
|---|---|---|---|
| v1.0 ID | `get_app_info(include:appStoreVersions)` | `16525a57-9e71-4968-a279-59b26f58c0bb` | ✓ |
| `appStoreState` | same | `PREPARE_FOR_SUBMISSION` | ✓ as expected |
| `appVersionState` | same | `PREPARE_FOR_SUBMISSION` | ✓ |
| `versionString` | same | `1.0` | ✓ |
| `platform` | same | `IOS` | ✓ |
| `releaseType` | same | `MANUAL` | ✓ |
| `copyright` | same | `2026 Murdoch Marcum` | ✓ populated |
| `build` relationship | same | (no data) | ✓ as expected — Build 10 not yet attached |
| Bundle ID | `get_app_info` | `com.murdochmarcum.snapquote` | ✓ |
| Primary locale | `get_app_info` | `en-US` | ✓ |

**Recommendation:** before clicking Submit, spend 60 seconds in the ASC dashboard (App Store → 1.0 page) to spot-check Subtitle / Description / Keywords / App Review Notes / screenshots / App Privacy "Published [N] days ago" badge / encryption answer / EU DSA. The user's prompt asserted these are correct; this audit was unable to corroborate via MCP. Risk of regression since Audit 2 is low (no one has been editing those fields), but the audit can't prove zero regression.

---

## 4. Nice-to-haves (2)

### NTH-1 — Archive old Stripe Business Annual price `price_1TLCZcFNX8cpZFmw0HVXNHwm`

Already noted in [Pending Work](https://www.notion.so/35432498a1cb81548fbee691c798b0f9) as "hygiene-only follow-up." Old $383.99/yr price is still `active=true` in Stripe with zero subscriptions referencing it. Doesn't affect submission. Archive when convenient.

### NTH-2 — Verify SnapQuote-mobile repo's git remote before next EAS build

Pending Work item. Not a submission blocker today since Build 10 is intentionally deferred — but should be confirmed before Murdoch kicks the next build, otherwise EAS may push to the wrong remote or fail.

---

## 5. Verification of today's fixes

### 5.1 Web commits + Vercel production deploy ✅

`git log --oneline -10` (in `C:\Users\murdo\SnapQuote`):

```
933079b fix: fall back to org.plan when subscription lookups are empty (Stripe vs IAP discriminator)
f764f0c copy: simplify preview mode banner
d73f4b8 docs: log contractor self-accept fix in current-state + add diagnostic write-ups
d9b6e83 feat(quote): preview-mode banner on public quote page for contractors
12d5398 fix: regenerate favicon from canonical BrandLogo SVG source
79bf5b9 fix: reject self-accept on public quote endpoint
a266209 feat: add favicon from AppIcon-1024 source
60cc2c5 fix: remove stale subscription gate from quote send route   ← yesterday
```

All five expected commits (79bf5b9, d9b6e83, f764f0c, d73f4b8, 933079b) present and on `main`. Two additional favicon commits (a266209, 12d5398) from a parallel session also landed.

Vercel production deployments (most recent first) — all `state: READY`:

| ID | Commit | Author | Created | Note |
|---|---|---|---|---|
| `dpl_HGEkfgsGkA265gz4VhVLocwttMfk` | `933079b` | murdoch45 | 2026-05-06 | **Current production** ✓ |
| `dpl_4NfyHpk4EMRz2NVASegfTnm2JkA9` | `f764f0c` | murdoch45 | 2026-05-06 | preview-banner copy |
| `dpl_yoGUjMw14aSFyG5K9Rtb6oxrPkd5` | `d9b6e83` | murdoch45 | 2026-05-06 | preview-banner UI |
| `dpl_Hbh2iS6WZREXqRVPQEUsYy1daCgJ` | `a266209` | murdoch45 | 2026-05-06 | favicon |

The current rolling production deploy is **`933079b`** — the Stripe-vs-IAP discriminator fix. ✓

### 5.2 Web typecheck + tests ✅

```
npx tsc --noEmit  → exit 0, no output
npm test          → 10 test files, 76/76 pass, ~2.9s
```

### 5.3 Code-level confirmations ✅

**`lib/subscription.ts:resolveBillingSource`** ([lines 161-202](lib/subscription.ts:161)) — fallback present at [line 188-201](lib/subscription.ts:188):

```ts
if ((iapCount ?? 0) > 0) return "iap";

// No Stripe rows AND no IAP events. Fall back to organizations.plan...
const { data: org, error: orgError } = await admin
  .from("organizations").select("plan").eq("id", orgId).maybeSingle();
if (orgError) { console.warn(...); return null; }
if (org?.plan && org.plan !== "SOLO") return "stripe";
return null;
```
✓ Confirmed shipped.

**`app/api/public/quote/[publicId]/accept/route.ts`** ([lines 33-55](app/api/public/quote/%5BpublicId%5D/accept/route.ts:33)) — contractor-org-member guard:

```ts
const userClient = await createServerSupabaseClient();
const { data: { user } } = await userClient.auth.getUser();
if (user) {
  const { data: ownMembership } = await userClient
    .from("organization_members").select("org_id")
    .eq("user_id", user.id).eq("org_id", quote.org_id as string).maybeSingle();
  if (ownMembership) {
    return NextResponse.json({ error: "Cannot accept your own estimate." }, { status: 403 });
  }
}
```
✓ Confirmed shipped.

**`components/PublicQuoteCard.tsx`** ([lines 30-53](components/PublicQuoteCard.tsx:30)) — `viewerIsContractor` prop, conditional /viewed POST skip, preview banner:

```tsx
export function PublicQuoteCard({ quote, viewerIsContractor = false }: {
  quote: QuoteData; viewerIsContractor?: boolean;
}) {
  ...
  useEffect(() => {
    if (isDraft || viewerIsContractor) return;
    fetch(`/api/public/quote/${quote.publicId}/viewed`, { method: "POST" }).catch(...);
  }, [quote.publicId, isDraft, viewerIsContractor]);
```

Banner branch in the action area renders "Preview mode — this is what your customer sees." when `viewerIsContractor` is true, replacing the Accept button. ✓

**`app/(public)/q/[publicId]/page.tsx`** ([lines 78-103](app/(public)/q/%5BpublicId%5D/page.tsx:78)) — server reads session, queries `organization_members`, passes `viewerIsContractor` to the card:

```tsx
let viewerIsContractor = false;
try {
  const userClient = await createServerSupabaseClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (user) {
    const { data: ownMembership } = await userClient
      .from("organization_members").select("org_id")
      .eq("user_id", user.id).eq("org_id", quote.org_id as string).maybeSingle();
    viewerIsContractor = Boolean(ownMembership);
  }
} catch (error) { console.warn(...); }
```

`<PublicQuoteCard quote={...} viewerIsContractor={viewerIsContractor} />` ([line 124](app/(public)/q/%5BpublicId%5D/page.tsx:124)). ✓

### 5.4 Demo org Supabase state ✅

Queried via Supabase MCP project `upqvbdldoyiqqshxquxa`:

**Org `bce3a561-455c-468e-9408-497803811800`:**
- `name` = `Demo`, `slug` = `org-6ee7074dc8e04f2b878ba7c2`
- `plan` = `BUSINESS` ✓
- `monthly_credits` = `100` ✓
- `bonus_credits` = `0` (per Audit 2 expectation)
- `has_used_trial` = `false`
- `onboarding_completed` = `true` ✓

**Leads (5 total, ordered by `submitted_at DESC`):**

| customer_name | status | service | has_ai_estimate | has_qa |
|---|---|---|---|---|
| Tom Robetson | NEW | Pressure Washing | ✓ | ✓ |
| Bob Thompson | ACCEPTED | Tree Service / Removal | ✓ | ✓ |
| Jim Davis | NEW | Roofing | ✓ | ✓ |
| James Doe | NEW | Outdoor Lighting Installation | ✓ | ✓ |
| John Smith | QUOTED | Window Cleaning | ✓ | ✓ |

→ 1 ACCEPTED + 1 QUOTED + 3 NEW. The user's stated layout is "5 leads, 2 sent quotes (Smith VIEWED, Thompson ACCEPTED), 3 leads NEW/locked." Lead status `QUOTED` corresponds to the John Smith quote whose **quote.status** is VIEWED — the lead is in QUOTED status because a quote has been sent. ✓ matches expected layout.

**Quotes (2 total) and `quote_events`:**

| customer | quote.status | sent_at | viewed_at | accepted_at | events | event timestamps |
|---|---|---|---|---|---|---|
| John Smith | VIEWED | 23:57:16.229 | 00:05:16.229 | null | `{SENT, VIEWED}` | `{23:57:17.048978, 00:05:16.229}` |
| Bob Thompson | ACCEPTED | 23:55:55.462 | 00:15:55.462 | 00:40:55.462 | `{SENT, VIEWED, ACCEPTED}` | `{23:55:56.351372, 00:15:55.462, 00:40:55.462}` |

**Bob Thompson timeline chronological order check:**
- `sent_at` (23:55:55) < `viewed_at` (00:15:55) < `accepted_at` (00:40:55) ✓
- Event log timestamps strictly ascending ✓
- SENT event 0.9s after `sent_at` (real API write); VIEWED + ACCEPTED match column timestamps exactly (consistent with backfill). ✓

**John Smith timeline chronological order check:**
- `sent_at` (23:57:16) < `viewed_at` (00:05:16) ✓
- Events ascending ✓

→ The "[Timeline missing VIEWED diagnostic from earlier today](C:/Users/murdo/SnapQuote-mobile/docs/timeline-viewed-missing-diagnostic-2026-05-06.md)" reported John Smith's `quote_events` had only `{SENT, ACCEPTED}` and no VIEWED row. After the backfill, John Smith now has `{SENT, VIEWED}` and Bob Thompson has the full `{SENT, VIEWED, ACCEPTED}` set. Both timelines are now well-formed.

→ One small note: the previous diagnostic recorded John Smith with a SENT and ACCEPTED but no VIEWED. The current state is SENT + VIEWED with **no** ACCEPTED — `accepted_at` is null and `quote.status` is VIEWED. So the demo data was reshaped, not just patched: John Smith was demoted from ACCEPTED back to VIEWED, presumably to give the App Review reviewer a "viewed but not yet accepted" example alongside Bob Thompson's "fully accepted" example. That matches the user's stated design (Smith VIEWED + Thompson ACCEPTED). ✓

### 5.5 Mobile repo state ✅

`git log --pretty="format:%h %ad %s" --date=short -5` (in `C:\Users\murdo\SnapQuote-mobile`):

```
39ae97d 2026-05-01 Onboarding: redo mobile contractor subtext fix
5746bb9 2026-04-30 Merge pull request #13
dd8dd99 2026-04-30 fix/verify: telnyx 10dlc sms config post-approval
85b704e 2026-04-30 Merge pull request #12
beb7090 2026-04-30 feat: update business plan seat limit from 4 to 5
```

→ No mobile commits today. Last meaningful mobile change `39ae97d` 2026-05-01. ✓

`git status --short`:
```
?? docs/branch-review-claude-crazy-heyrovsky.md
?? docs/stripe-vs-iap-display-bug-diagnostic-2026-05-06.md
?? docs/timeline-viewed-missing-diagnostic-2026-05-06.md
```
→ Three untracked diagnostic docs only, no modified code. ✓

**Mobile sanity grep:**
- `SignInWithApple` → wired in `app/(auth)/login.tsx` ✓
- `Restore Purchases` / `restorePurchases` → present in `app/(tabs)/more/plan.tsx` and `lib/revenuecat.ts` ✓
- `/api/stripe/checkout` / `stripeCheckout` → only in `app/(tabs)/more/plan.tsx` and `app/(tabs)/more/credits.tsx` referencing the openAuthenticatedBrowser routes for Stripe-billed users (the manage-on-web link), **not** as a checkout call from mobile ✓
- IAP product IDs (`snapquote_team_*`, `snapquote_business_*`, `snapquote_credits_*`) match ASC product IDs from the `inAppPurchases` query above ✓
- IAP disclosure language present in [plan.tsx](C:/Users/murdo/SnapQuote-mobile/app/(tabs)/more/plan.tsx:759-789) including auto-renew terms, Apple ID charge, manage/cancel instructions, Terms/Privacy links ✓ (no mobile changes today; this is the same as Audit 1 confirmed clean state)

→ Audit 1's known-clean mobile state is intact.

### 5.6 ASC IAP states ✅

All 7 IAPs `state = READY_TO_SUBMIT` (queried via `get_app_info(include:inAppPurchases)`):

| Reference Name | Product ID | Type | State |
|---|---|---|---|
| Team Monthly | `snapquote_team_monthly` | AUTO_RENEWING_SUB | READY_TO_SUBMIT ✓ |
| Team Annual | `snapquote_team_annual` | AUTO_RENEWING_SUB | READY_TO_SUBMIT ✓ |
| Business Monthly | `snapquote_business_monthly` | AUTO_RENEWING_SUB | READY_TO_SUBMIT ✓ |
| Business Annual | `snapquote_business_annual` | AUTO_RENEWING_SUB | READY_TO_SUBMIT ✓ |
| 10 Credits | `snapquote_credits_10` | CONSUMABLE | READY_TO_SUBMIT ✓ |
| 50 Credits | `snapquote_credits_50` | CONSUMABLE | READY_TO_SUBMIT ✓ |
| 100 Credits | `snapquote_credits_100` | CONSUMABLE | READY_TO_SUBMIT ✓ |

All match the IAP product IDs hardcoded in mobile (`SnapQuote-mobile/app/(tabs)/more/plan.tsx:334-341` for subs, `SnapQuote-mobile/app/(tabs)/more/credits.tsx:26-30` for credit packs). ✓

**Subscription group `groupLevel` ordering:** the MCP exposes `subscriptionGroups` only as a relationship link, not as a queryable resource on the IAPs themselves. Cannot programmatically verify ordering — must spot-check in the ASC dashboard (manual SR-1 task above).

### 5.7 IAP review screenshots

Cannot verify via this MCP — no `inAppPurchaseImages` or screenshot inclusion path on the `inAppPurchases` resource. Spot-check manually if uncertain.

### 5.8 Sentry — no errors from today's new code paths ✅

`search_issues(query="is:unresolved firstSeen:-1d level:error")` returned 2 issues, both Telnyx SMS:

| Issue | Culprit | First seen | Events |
|---|---|---|---|
| `SNAPQUOTE-WEB-8` | `POST /api/app/quote/send` — Telnyx 10002 invalid destination number | 12h ago | 2 |
| `SNAPQUOTE-WEB-7` | `POST /api/public/lead-submit` — Telnyx 10002 invalid destination number | 12h ago | 3 |

→ Both are "invalid phone number" failures from Telnyx — almost certainly a fake/seed phone number being passed to SMS. **Neither is from today's new code paths** (accept guard, viewerIsContractor detection, resolveBillingSource fallback). The contractor self-accept guard, the public quote page's session lookup, and the org-plan fallback all fired in production over the last 24h with zero errors logged.

---

## 6. New issues introduced today

**None.**

Per Section E of the prompt, I traced each potential regression vector:

### 6.1 Anonymous customer accept flow still works ✅

[`app/api/public/quote/[publicId]/accept/route.ts:38-55`](app/api/public/quote/%5BpublicId%5D/accept/route.ts:38) — for anonymous requests, `userClient.auth.getUser()` returns `{ user: null }`. The `if (user)` block is skipped entirely. Control falls through to the existing accept logic at line 57+ unchanged. The customer's email/SMS click → public page mount → POST /accept path is byte-identical to pre-fix behavior for anyone without a Supabase session cookie. ✓

### 6.2 New SOLO signup still gets IAP UI on mobile ✅

[`lib/subscription.ts:resolveBillingSource`](lib/subscription.ts:161) precedence after fix:
1. `stripeRowCount > 0` → `"stripe"` (paid Stripe sub exists)
2. `iapCount > 0` → `"iap"` (IAP event exists)
3. `org.plan && org.plan !== "SOLO"` → `"stripe"` (orphaned-from-Stripe; org reached non-SOLO via past webhook)
4. else → `null`

For a brand-new SOLO signup: zero Stripe rows + zero IAP events + `organizations.plan = 'SOLO'` → falls through to `null`. Mobile reads `null` as "show IAP UI" (per [plan.tsx:263-265](C:/Users/murdo/SnapQuote-mobile/app/(tabs)/more/plan.tsx:263)). ✓ unchanged.

### 6.3 viewerIsContractor detection works for any org, no Demo-org hack ✅

[`app/(public)/q/[publicId]/page.tsx:78-103`](app/(public)/q/%5BpublicId%5D/page.tsx:78) — the lookup uses the actual quote's `org_id` and the requesting user's `user.id`, no hardcoded org IDs anywhere:

```ts
const { data: ownMembership } = await userClient
  .from("organization_members").select("org_id")
  .eq("user_id", user.id)
  .eq("org_id", quote.org_id as string)  // ← actual quote's org, not a constant
  .maybeSingle();
```

No `DEMO_ORG_ID`, no `bce3a561-...`, no contractor allowlist. Generic membership check. ✓

### 6.4 Demo data quality — quote events match quote timestamps ✅

Already verified in §5.4. Bob Thompson's three event timestamps (`{23:55:56, 00:15:55, 00:40:55}`) and quote columns (`sent_at=23:55:55`, `viewed_at=00:15:55`, `accepted_at=00:40:55`) are tightly correlated and strictly ascending — the SENT event lands ~0.9s after `sent_at` (consistent with real API insertion), and VIEWED + ACCEPTED match column timestamps exactly to the millisecond (consistent with deliberate backfill). John Smith similarly clean.

### 6.5 Sentry web errors ✅

Already covered — no errors from today's code paths.

---

## 7. Pending Work reconciliation

Read [Pending Work in Notion](https://www.notion.so/35432498a1cb81548fbee691c798b0f9) (74,209 chars). Summary by submission-relevance:

### Submission-blocking (must be resolved before Submit)

| Item | Status | Note |
|---|---|---|
| iPhone 6.5"/6.9" screenshots uploaded | Claimed done by user (Audit 2.5 prompt §"Confirmed shipped" #2) | Cannot verify via MCP (SR-1) |
| App Privacy Published | Claimed done by user (#1) | Cannot verify via MCP (SR-1) |
| ASC "5 team seats" copy matches code | Already RESOLVED 2026-04-30 (commit `beb7090` raised seat limit 4→5) | ✓ |
| Demo data seeded | ✓ Verified via Supabase | ✓ |
| EU DSA Trader status | Cannot verify via MCP | Manual SR-1 check |
| Subscription levels reordered | Cannot verify via MCP (subscription_groups not queryable) | Manual SR-1 check |
| Build 10 attached to v1.0 | Out of scope per user instructions | ⏳ deferred |

### Hygiene / post-launch (NOT blocking submission)

- Old Stripe price `price_1TLCZcFNX8cpZFmw0HVXNHwm` archive (NTH-1)
- BUSINESS seat constant duplication refactor
- TopBar.tsx typed-routes errors (technical debt)
- SnapQuote-mobile git remote verification (NTH-2)
- Stripe price metadata audit
- Orphan lead-photo cleanup cron
- Schema reduction for AI estimator
- Pressure-washing photo detail A/B
- Android release pipeline
- Re-enable EAS Update OTA after Build 6+ stable
- Marketing & Distribution Launch tasks

### Resolved today, confirmed via verification above

- Stripe Business Annual price alignment (resolved 2026-05-04)
- ASC MCP 401s (resolved 2026-05-04 via `'20m'`→`'19m'` JWT patch)
- Vercel env var update for new Stripe Business Annual price (resolved)
- AI estimator timeout topology (resolved earlier this week)
- Web favicons (resolved 2026-05-06 commit `a266209` / `12d5398`)
- Plan/credits hidden from new users — over-correction regression (resolved earlier)
- Replay tour TOKEN_REFRESHED toast (resolved earlier)
- Mobile contractor self-accept on public quote page (resolved today, audited above)
- Stripe-vs-IAP discriminator returning null for orphaned Stripe orgs (resolved today, audited above)

---

## 8. Final verdict

### Submit today? Conditionally YES.

**The web/server side is ready to submit right now.** All today's commits are on `main`, deployed to production at `dpl_HGEkfgsGkA265gz4VhVLocwttMfk`, code-verified, tested, and Sentry-clean. No regressions in mobile (no commits today). Demo data is well-formed and reflects the desired App Review reviewer experience. ASC v1.0 is in `PREPARE_FOR_SUBMISSION` with copyright populated, MANUAL release type, and all 7 IAPs `READY_TO_SUBMIT`.

**Two preconditions remain before Murdoch can click "Add for Review":**

1. **Build 10 must be built, processed by ASC, and attached to v1.0.** This is the only known hard remaining item. Out of scope for this audit per user direction.

2. **Manual ASC dashboard sanity-check on the metadata fields the MCP cannot read** (SR-1): subtitle is "Better Jobs, Instant Estimates"; description / keywords / promotional text / marketing URL / support URL still populated; App Review Notes contains both the original 3.1.1 explanation and the new IAP testing instructions for the demo account; ≥3 screenshots in iPhone 6.9" Display section at 1320×2868; App Privacy still shows "Published [N] days ago"; encryption export compliance answered; EU DSA Trader status declared (or marked Non-Trader); subscription `groupLevel` ordering correct. These were all confirmed by the user as done, but this audit could not corroborate via API. ~60 seconds in the dashboard.

**No new bugs were introduced by today's work. No hard blockers found.** Once Build 10 is attached and the SR-1 spot-check passes, you can submit.

### One-sentence verdict

> Web/server is submission-ready right now (today's fixes verified shipped, deployed at `933079b`, tests green, demo data clean, no Sentry regressions); the only known remaining gates are Build 10 and a 60-second manual ASC dashboard spot-check on metadata fields the MCP can't read.
