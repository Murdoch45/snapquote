-- Audit 8 PII gating (2026-05-08).
--
-- Closes Audit 8 C1 (get_org_analytics anon bypass), C2 (leads PII reachable
-- via PostgREST regardless of unlock), and H10 (customers PII same shape).
-- All three were verified live via Supabase MCP before this migration:
--
-- C1 — POC: anonymous curl to /rest/v1/rpc/get_org_analytics with the
-- publishable key + arbitrary p_org_id returned full {totals, leadsOverTime,
-- quotesOverTime, servicesBreakdown, acceptanceRateOverTime} JSON. Function
-- proacl was {=X/postgres,postgres=X/postgres,anon=X/postgres,…} and body
-- guard was `if auth.uid() is not null and not is_org_member(p_org_id) then
-- raise exception …` — anon's auth.uid() is null, so the guard skips and
-- returns data. Migration 0053's intentional service-role bypass collapsed
-- to anon bypass at the public REST gateway.
--
-- C2 — pg_policies for leads showed leads_member_crud cmd=ALL, qual/with_check
-- = is_org_member(org_id), with no lead_unlocks filter. Live: 3,393 locked
-- vs 80 unlocked leads. Mobile lib/api/leads.ts:53-54 LEAD_LIST_COLUMNS
-- explicitly projects customer_name, customer_phone, customer_email,
-- address_full, and the response is cached unredacted to AsyncStorage
-- (lib/hooks/useLeads.ts:142-150). UI conditioning on is_unlocked is
-- cosmetic — direct PostgREST queries (or any debugger / proxy reading the
-- response) bypass the paywall.
--
-- H10 — same shape on customers (customers_member_crud, polcmd=*).
--
-- Fix design — Option B (database VIEW with column-level REVOKE):
--   1. Column-level REVOKE SELECT on PII columns of leads/customers from
--      `authenticated`. Direct PostgREST `?select=customer_phone,…` queries
--      from any authenticated org member now 403. Service_role has BYPASS
--      and is unaffected. Anon never had a SELECT policy match (RLS already
--      blocks).
--   2. Create leads_safe + customers_safe views, owned by `postgres` (default
--      view ownership; security_invoker = false), with explicit
--      `WHERE is_org_member(org_id)` tenant gate. Postgres has BYPASSRLS so
--      the explicit WHERE is the membership check. is_org_member() reads
--      auth.uid() from the session GUC (set by PostgREST per request from
--      the bearer JWT).
--   3. PII columns are gated via CASE-based projection keyed on lead_unlocks
--      (LEFT JOIN for leads_safe; LATERAL JOIN that matches by org_id +
--      either phone or email for customers_safe — semantically: "this
--      customer has been unlocked for at least one lead matching their
--      contact info").
--   4. Convenience `is_unlocked boolean` column on each view so client-side
--      reads can drop the separate lead_unlocks query.
--
-- Caller migration (companion changes outside this SQL file):
--   - Mobile: lib/api/leads.ts switches from("leads") → from("leads_safe")
--     for getLeads/getLead read paths; drops the lead_unlocks PostgREST
--     embed in favor of the view's is_unlocked column. lib/api/quotes.ts
--     switches the embed lead:leads(...) → lead:leads_safe(...). Cache key
--     in lib/hooks/useLeads.ts bumps `cache:leads:` → `cache:leads:v2:` to
--     invalidate any AsyncStorage-cached PII captured under the leak.
--   - Web: every SSR page that reads PII via the user-scoped client switches
--     from("leads") → from("leads_safe"). Admin-client (service_role) reads
--     in lib/credits.ts, lib/demo/server.ts, app/api/**/route.ts are
--     unaffected — service_role retains direct table SELECT.

-- ============================================================================
-- C1: get_org_analytics — REVOKE anon, tighten body
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.get_org_analytics(uuid, timestamptz, timestamptz, text)
  FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.get_org_analytics(
  p_org_id uuid,
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_timezone text DEFAULT 'UTC'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
declare
  v_role text := coalesce(auth.role(), '');
  v_start         timestamptz := p_start_date;
  v_end           timestamptz := coalesce(p_end_date, now());
  v_total_leads   int;
  v_quotes_sent   int;
  v_quotes_accepted int;
  v_avg_quote_value numeric;
  v_avg_response_minutes numeric;
  v_acceptance_rate numeric;
  v_leads_per_day jsonb;
  v_quotes_per_day jsonb;
  v_acceptance_rate_per_day jsonb;
  v_services_breakdown jsonb;
begin
  -- Auth gate.
  --   * service_role (web admin client + unstable_cache wrapper): bypass.
  --     Migration 0053 introduced this bypass because unstable_cache closures
  --     can't read cookies/headers; the wrapper has already run requireAuth().
  --   * authenticated: must be a member of p_org_id.
  --   * anon (and any caller without auth.uid()): denied. This is the C1 fix
  --     — the prior `auth.uid() is not null and not is_org_member` guard
  --     skipped for anon (anon has auth.uid() IS NULL).
  if v_role <> 'service_role' then
    if auth.uid() is null or not is_org_member(p_org_id) then
      raise exception 'permission denied for organization %', p_org_id
        using errcode = '42501';
    end if;
  end if;

  -- ---- (Body identical to migration 0053 from here onward.) -----------------

  if v_start is null then
    select least(
      (select min(submitted_at) from leads
        where org_id = p_org_id and ai_status = 'ready'),
      (select min(sent_at) from quotes
        where org_id = p_org_id
          and status in ('SENT','VIEWED','ACCEPTED','EXPIRED'))
    ) into v_start;
  end if;

  if v_start is null then
    v_start := v_end - interval '30 days';
  end if;

  select count(*)
    into v_total_leads
    from leads
   where org_id = p_org_id
     and ai_status = 'ready'
     and submitted_at >= v_start
     and submitted_at <= v_end;

  select count(*),
         coalesce(
           avg(price) filter (where price is not null and price > 0),
           0
         )
    into v_quotes_sent, v_avg_quote_value
    from quotes
   where org_id = p_org_id
     and status in ('SENT','VIEWED','ACCEPTED','EXPIRED')
     and sent_at >= v_start
     and sent_at <= v_end;

  select count(*)
    into v_quotes_accepted
    from quotes
   where org_id = p_org_id
     and status = 'ACCEPTED'
     and sent_at >= v_start
     and sent_at <= v_end;

  v_acceptance_rate := case
    when v_quotes_sent = 0 then 0
    else round((v_quotes_accepted::numeric / v_quotes_sent) * 100, 1)
  end;

  select avg(delta_minutes)
    into v_avg_response_minutes
    from (
      select extract(
               epoch from (min(q.sent_at) - l.submitted_at)
             ) / 60.0 as delta_minutes
        from quotes q
        join leads l on l.id = q.lead_id
       where q.org_id = p_org_id
         and q.status in ('SENT','VIEWED','ACCEPTED','EXPIRED')
         and q.sent_at >= v_start
         and q.sent_at <= v_end
       group by q.lead_id, l.submitted_at
      having min(q.sent_at) >= l.submitted_at
    ) t;

  with day_spine as (
    select gs::date as day
      from generate_series(
             (v_start at time zone p_timezone)::date,
             (v_end   at time zone p_timezone)::date,
             '1 day'::interval
           ) gs
  ),
  leads_bucketed as (
    select (submitted_at at time zone p_timezone)::date as day,
           count(*) as c
      from leads
     where org_id = p_org_id
       and ai_status = 'ready'
       and submitted_at >= v_start
       and submitted_at <= v_end
     group by 1
  ),
  quotes_bucketed as (
    select (sent_at at time zone p_timezone)::date as day,
           count(*) as sent,
           count(*) filter (where status = 'ACCEPTED') as accepted
      from quotes
     where org_id = p_org_id
       and status in ('SENT','VIEWED','ACCEPTED','EXPIRED')
       and sent_at >= v_start
       and sent_at <= v_end
     group by 1
  ),
  joined as (
    select d.day,
           coalesce(lb.c, 0)       as lead_count,
           coalesce(qb.sent, 0)    as quote_count,
           coalesce(qb.accepted, 0) as accepted_count
      from day_spine d
      left join leads_bucketed  lb on lb.day = d.day
      left join quotes_bucketed qb on qb.day = d.day
  )
  select
    coalesce(jsonb_agg(
      jsonb_build_object(
        'date', to_char(day, 'YYYY-MM-DD'),
        'count', lead_count
      ) order by day
    ), '[]'::jsonb),
    coalesce(jsonb_agg(
      jsonb_build_object(
        'date', to_char(day, 'YYYY-MM-DD'),
        'count', quote_count
      ) order by day
    ), '[]'::jsonb),
    coalesce(jsonb_agg(
      jsonb_build_object(
        'date', to_char(day, 'YYYY-MM-DD'),
        'rate', case
                  when quote_count = 0 then 0
                  else round((accepted_count::numeric / quote_count) * 100, 1)
                end
      ) order by day
    ), '[]'::jsonb)
  into v_leads_per_day, v_quotes_per_day, v_acceptance_rate_per_day
  from joined;

  with exploded as (
    select unnest(services) as service
      from leads
     where org_id = p_org_id
       and ai_status = 'ready'
       and submitted_at >= v_start
       and submitted_at <= v_end
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object('name', service, 'value', c)
      order by c desc, service asc
    ),
    '[]'::jsonb
  )
    into v_services_breakdown
    from (
      select service, count(*) as c
        from exploded
       where service is not null
       group by service
    ) s;

  return jsonb_build_object(
    'totals', jsonb_build_object(
      'totalLeads',         v_total_leads,
      'quotesSent',         v_quotes_sent,
      'quotesAccepted',     v_quotes_accepted,
      'acceptanceRate',     v_acceptance_rate,
      'avgQuoteValue',      round(coalesce(v_avg_quote_value, 0), 2),
      'avgResponseMinutes', case
                              when v_avg_response_minutes is null then null
                              else round(v_avg_response_minutes, 1)
                            end
    ),
    'leadsOverTime',          v_leads_per_day,
    'quotesOverTime',         v_quotes_per_day,
    'acceptanceRateOverTime', v_acceptance_rate_per_day,
    'servicesBreakdown',      v_services_breakdown
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION public.get_org_analytics(uuid, timestamptz, timestamptz, text)
  TO authenticated, service_role;

-- ============================================================================
-- C2: leads — REVOKE table SELECT + GRANT non-PII column allowlist + leads_safe view
-- ============================================================================
-- Column-level REVOKE alone is a no-op when the role has table-level SELECT
-- (PG privilege model: column-level REVOKE only removes column-level GRANTs;
-- the table-level GRANT continues to allow access to every column). The
-- correct pattern is: REVOKE table-level SELECT, then GRANT SELECT only on
-- the allowlisted (non-PII) columns. INSERT/UPDATE/DELETE grants are
-- preserved so leads_member_crud RLS continues to gate write paths.

REVOKE SELECT ON public.leads FROM authenticated;

GRANT SELECT (
  id,
  org_id,
  contractor_slug_snapshot,
  services,
  status,
  submitted_at,
  updated_at,
  ai_status,
  job_city,
  job_state,
  job_zip,
  pricing_region,
  house_sqft,
  estimated_backyard_sqft,
  service_category,
  job_type,
  terrain_classification,
  access_difficulty,
  material_tier,
  fence_linear_ft,
  ai_job_summary,
  ai_estimate_low,
  ai_estimate_high,
  ai_suggested_price,
  ai_draft_message,
  ai_generated_at,
  ai_confidence,
  ai_confidence_score,
  ai_cost_breakdown,
  yard_layout,
  demo_items,
  service_question_answers,
  ai_service_estimates,
  ai_pricing_drivers,
  ai_estimator_notes,
  ai_retry_count,
  travel_distance_miles
) ON public.leads TO authenticated;

CREATE OR REPLACE VIEW public.leads_safe AS
SELECT
  l.id,
  l.org_id,
  l.contractor_slug_snapshot,
  l.services,
  l.status,
  l.submitted_at,
  l.updated_at,
  l.ai_status,
  l.job_city,
  l.job_state,
  l.job_zip,
  l.pricing_region,
  l.house_sqft,
  l.estimated_backyard_sqft,
  l.service_category,
  l.job_type,
  l.terrain_classification,
  l.access_difficulty,
  l.material_tier,
  l.fence_linear_ft,
  l.ai_job_summary,
  l.ai_estimate_low,
  l.ai_estimate_high,
  l.ai_suggested_price,
  l.ai_draft_message,
  l.ai_generated_at,
  l.ai_confidence,
  l.ai_confidence_score,
  l.ai_cost_breakdown,
  l.yard_layout,
  l.demo_items,
  l.service_question_answers,
  l.ai_service_estimates,
  l.ai_pricing_drivers,
  l.ai_estimator_notes,
  l.ai_retry_count,
  l.travel_distance_miles,
  -- PII columns: NULL when locked, real value when unlocked.
  CASE WHEN u.lead_id IS NOT NULL THEN l.customer_name        END AS customer_name,
  CASE WHEN u.lead_id IS NOT NULL THEN l.customer_phone       END AS customer_phone,
  CASE WHEN u.lead_id IS NOT NULL THEN l.customer_email       END AS customer_email,
  CASE WHEN u.lead_id IS NOT NULL THEN l.address_full         END AS address_full,
  CASE WHEN u.lead_id IS NOT NULL THEN l.address_place_id     END AS address_place_id,
  CASE WHEN u.lead_id IS NOT NULL THEN l.lat                  END AS lat,
  CASE WHEN u.lead_id IS NOT NULL THEN l.lng                  END AS lng,
  CASE WHEN u.lead_id IS NOT NULL THEN l.description          END AS description,
  CASE WHEN u.lead_id IS NOT NULL THEN l.parcel_lot_size_sqft END AS parcel_lot_size_sqft,
  (u.lead_id IS NOT NULL) AS is_unlocked
FROM public.leads l
LEFT JOIN public.lead_unlocks u
  ON u.org_id = l.org_id AND u.lead_id = l.id
WHERE is_org_member(l.org_id);

GRANT SELECT ON public.leads_safe TO authenticated, service_role;

COMMENT ON VIEW public.leads_safe IS
  'PII-gated view over public.leads. Returns NULL for customer_name, customer_phone, customer_email, address_full, address_place_id, lat, lng, description, parcel_lot_size_sqft when there is no row in public.lead_unlocks for (org_id, id). Tenant isolation is enforced by the WHERE is_org_member(l.org_id) clause inside the view body — the view runs as its owner (postgres, BYPASSRLS) so the underlying RLS does not apply. Use this view from authenticated client contexts; service_role can read public.leads directly.';

-- ============================================================================
-- H10: customers — REVOKE table SELECT + GRANT non-PII column allowlist + customers_safe view
-- ============================================================================

REVOKE SELECT ON public.customers FROM authenticated;

GRANT SELECT (id, org_id, created_at, updated_at) ON public.customers TO authenticated;

CREATE OR REPLACE VIEW public.customers_safe AS
SELECT
  c.id,
  c.org_id,
  c.created_at,
  c.updated_at,
  -- A customer is considered "unlocked" if at least one lead in the same
  -- org has been unlocked AND that lead's customer_phone/customer_email
  -- matches this customer row. citext-vs-text compare on email is handled
  -- via explicit cast to citext (case-insensitive equality).
  CASE WHEN unlocked.lead_id IS NOT NULL THEN c.name  END AS name,
  CASE WHEN unlocked.lead_id IS NOT NULL THEN c.phone END AS phone,
  CASE WHEN unlocked.lead_id IS NOT NULL THEN c.email END AS email,
  (unlocked.lead_id IS NOT NULL) AS is_unlocked
FROM public.customers c
LEFT JOIN LATERAL (
  SELECT lu.lead_id
    FROM public.lead_unlocks lu
    JOIN public.leads l ON l.id = lu.lead_id
   WHERE l.org_id = c.org_id
     AND (
       (c.phone IS NOT NULL AND l.customer_phone = c.phone)
       OR (c.email IS NOT NULL AND l.customer_email::citext = c.email)
     )
   LIMIT 1
) unlocked ON true
WHERE is_org_member(c.org_id);

GRANT SELECT ON public.customers_safe TO authenticated, service_role;

COMMENT ON VIEW public.customers_safe IS
  'PII-gated view over public.customers. Returns NULL for name, phone, email when no lead_unlocks row matches the customer (by org_id + customer_phone or customer_email). Tenant isolation enforced via WHERE is_org_member inside the view (security_invoker=false; view runs as postgres). Use this view from authenticated client contexts.';
