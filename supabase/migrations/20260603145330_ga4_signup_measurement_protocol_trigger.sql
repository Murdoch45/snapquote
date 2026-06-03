-- GA4 `sign_up` via the Measurement Protocol, fired SERVER-SIDE on every
-- auth.users INSERT.
--
-- Why this replaces the client path:
--   The old client-side path (components/onboarding/OnboardingWizard.tsx ->
--   gtag('event','sign_up')) only fired if the user reached /onboarding with a
--   sessionStorage flag set. It never fired for OAuth (the callback redirects to
--   /app, so OnboardingWizard never mounts) and never for the mobile app.
--   BigQuery (snapquote-489712.analytics_536039041.events_*) confirmed ZERO
--   sign_up events for 2026-05-26..2026-06-02 despite real email signups on
--   2026-05-29 and 2026-06-03. Firing on the auth.users INSERT covers every
--   provider (email / google / apple) and every client (web + mobile) exactly
--   once, independent of redirects, tabs, or gtag readiness.
--
-- Secret handling:
--   The GA4 Measurement Protocol api_secret is read from Supabase Vault (secret
--   name 'ga4_api_secret'). It is intentionally NOT in this migration or the
--   repo. Set it once (out of band) with:
--     select vault.create_secret(
--       '<API_SECRET>', 'ga4_api_secret',
--       'GA4 Measurement Protocol API secret for property G-2QM16SWP9D (server-side sign_up)');
--   The measurement id G-2QM16SWP9D is NOT a secret (already hardcoded in
--   app/layout.tsx), so it is inlined below.
--
-- Permissions:
--   GoTrue inserts into auth.users as `supabase_auth_admin`, so that role MUST
--   have EXECUTE on the trigger function or EVERY signup 500s. This mirrors the
--   lesson of migrations 0063 / 0064 for handle_auth_user_pending_invites().

create or replace function public.ga4_track_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_api_secret text;
  v_provider   text;
  v_payload    jsonb;
begin
  -- Runs as the function OWNER (security definer), not supabase_auth_admin, so
  -- the Vault read is permitted even though the inserting role cannot read Vault.
  select decrypted_secret
    into v_api_secret
    from vault.decrypted_secrets
   where name = 'ga4_api_secret'
   limit 1;

  -- Not configured yet -> clean no-op. Analytics must NEVER block user creation.
  if v_api_secret is null or length(v_api_secret) = 0 then
    return new;
  end if;

  v_provider := coalesce(new.raw_app_meta_data ->> 'provider', 'email');

  -- client_id is derived deterministically from the user id, so a repeat send for
  -- the same user maps to the same GA4 client (idempotent on the client axis).
  -- user_id is set top-level so GA4 events can be joined back to auth.users.
  -- session_id is synthesized (a server event has no browser session) so the event
  -- also surfaces in GA4 Realtime / standard reports, not only in the BigQuery export.
  v_payload := jsonb_build_object(
    'client_id', new.id::text,
    'user_id',   new.id::text,
    'timestamp_micros', (extract(epoch from clock_timestamp()) * 1000000)::bigint,
    'events', jsonb_build_array(
      jsonb_build_object(
        'name', 'sign_up',
        'params', jsonb_build_object(
          'method',               v_provider,
          'signup_user_id',       new.id::text,
          'source',               'server_auth_users_trigger',
          'session_id',           (extract(epoch from clock_timestamp()))::bigint::text,
          'engagement_time_msec', 1
        )
      )
    )
  );

  -- pg_net is async: it enqueues and a background worker performs the POST, so this
  -- never adds latency to (or fails) the signup transaction. measurement_id +
  -- api_secret go through `params` so pg_net URL-encodes them safely (the secret is
  -- never raw-concatenated into the URL string). Default header is application/json.
  perform net.http_post(
    url    := 'https://www.google-analytics.com/mp/collect',
    body   := v_payload,
    params := jsonb_build_object(
      'measurement_id', 'G-2QM16SWP9D',
      'api_secret',     v_api_secret
    )
  );

  return new;
exception
  when others then
    -- Never fail user creation on analytics. Leave a breadcrumb in the Postgres
    -- logs (RAISE WARNING does not abort the INSERT) so a future regression that
    -- stops sign_up from enqueuing is at least visible.
    raise warning 'ga4_track_signup failed for user %: %', new.id, sqlerrm;
    return new;
end;
$$;

-- Keep the function off PostgREST (mirrors 0063) and grant EXECUTE only to the
-- auth admin that fires the trigger (mirrors 0064). Owner (postgres) and
-- service_role retain EXECUTE implicitly.
revoke execute on function public.ga4_track_signup() from public;
revoke execute on function public.ga4_track_signup() from anon, authenticated;
grant  execute on function public.ga4_track_signup() to supabase_auth_admin;

drop trigger if exists on_auth_user_created_ga4_signup on auth.users;
create trigger on_auth_user_created_ga4_signup
  after insert on auth.users
  for each row
  execute function public.ga4_track_signup();

-- NOTE on the api_secret + pg_net: GA4 MP requires the secret in the request, and
-- pg_net stores in-flight requests transiently in net.http_request_queue (drained by
-- its background worker). Passing it via `params` (above) keeps it URL-encoded rather
-- than raw-concatenated, but the value still transits that queue table. Locking the
-- queue down is intentionally NOT done in this migration: read access to net.* is
-- granted to anon/authenticated/service_role by the Supabase platform (not a simple
-- PUBLIC grant), so a table-level REVOKE here is out-of-scope for an auth trigger and
-- fragile (pg_net upgrades re-grant). Exposure is low -- transient, and direct-SQL
-- only (net is not exposed over PostgREST). Tracked as a separate hardening follow-up.
