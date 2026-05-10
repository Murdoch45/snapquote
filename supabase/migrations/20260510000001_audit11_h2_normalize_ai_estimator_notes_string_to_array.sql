-- Audit 11 H2 fix: normalize legacy `ai_estimator_notes` rows that are
-- a JSONB STRING into a single-element JSONB ARRAY matching the shape
-- every other writer produces. Code at HEAD already writes arrays; this
-- backfills the rows the rescue cron's pre-fix writer left behind.
--
-- Strategy: each string-shape row becomes a single-element array of one
-- structured `{phase, ts, message}` object so the post-fix shape is
-- consistent with the F5 timing-marker fix shipping in the same branch.
-- The `ts` is the row's `submitted_at` (close-enough proxy for when
-- the rescue cron's give-up actually fired; we don't know the exact
-- give-up time but the row was stuck at least GIVE_UP_MINUTES=15
-- minutes from `submitted_at`). Phase slug is `rescue_give_up_legacy`
-- so it's distinguishable from new-format rows written by the patched
-- cron at app/api/cron/rescue-stuck-leads/route.ts.
--
-- Idempotent: WHERE clause filters on jsonb_typeof = 'string', so re-
-- running this on already-normalized rows is a no-op.
--
-- Applied via Supabase MCP on 2026-05-10 ahead of merge to main.
UPDATE public.leads
SET ai_estimator_notes = jsonb_build_array(
  jsonb_build_object(
    'phase', 'rescue_give_up_legacy',
    'ts', COALESCE(submitted_at, NOW()) AT TIME ZONE 'UTC',
    'message', ai_estimator_notes
  )
)
WHERE jsonb_typeof(ai_estimator_notes) = 'string';
