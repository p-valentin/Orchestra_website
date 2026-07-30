-- Admin dashboard metrics.
--
-- Two things live here:
--
--   1. device_checkins — an append-only record of which devices were active on
--      which day. devices.last_seen_at is a single overwritten column, so it can
--      answer "who is active now" and nothing at all about last Tuesday. A daily
--      row per device makes DAU/WAU historical rather than instantaneous.
--
--   2. admin_metrics() — every count the admin overview needs, in ONE call.
--      admin-data has no query language by design (see its header), so each new
--      metric would otherwise mean a new named view and another signed HTTP
--      round-trip. One function returning one jsonb keeps the page at a single
--      request and keeps the shape reviewable in one place.
--
-- The function is SECURITY DEFINER because auth.users is not reachable through
-- PostgREST at all, and because the website deliberately holds no service-role
-- key. It returns COUNTS ONLY — no emails, no ids, nothing that identifies a
-- person — so the result needs no masking and the admin page stays safe to
-- screenshot. That property is the reason to keep this function narrow: the
-- moment it returns a row of user data it needs the whole masking apparatus
-- that purchases already has.

-- ---------------------------------------------------------------- checkins

create table if not exists public.device_checkins (
  device_id   uuid not null references public.devices(id) on delete cascade,
  day         date not null,
  platform    text,
  app_version text,
  primary key (device_id, day)
);

comment on table public.device_checkins is
  'One row per device per active day. Written by the entitlement function on every heartbeat via ON CONFLICT DO NOTHING, so it grows by devices x days, not by heartbeats.';

-- The dashboard reads by day; the PK already covers per-device lookups.
create index if not exists device_checkins_day_idx on public.device_checkins (day desc);

alter table public.device_checkins enable row level security;

-- No policies, matching webhook_events and the mail tables: reachable only by
-- the service role from inside an Edge Function.
revoke all on table public.device_checkins from anon, authenticated;

-- ---------------------------------------------------------------- metrics

create or replace function public.admin_metrics()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(

    'accounts', (
      select jsonb_build_object(
        'total',     count(*),
        'confirmed', count(*) filter (where email_confirmed_at is not null),
        'new_24h',   count(*) filter (where created_at > now() - interval '24 hours'),
        'new_7d',    count(*) filter (where created_at > now() - interval '7 days'),
        'new_30d',   count(*) filter (where created_at > now() - interval '30 days')
      )
      from auth.users
    ),

    'trials', (
      select jsonb_build_object(
        'total',     count(*),
        'running',   count(*) filter (where ends_at > now()),
        'started_7d',  count(*) filter (where started_at > now() - interval '7 days'),
        'started_30d', count(*) filter (where started_at > now() - interval '30 days'),
        -- Trials that ran out without the account ever acquiring a license.
        -- This is the number that says whether the product converts.
        'expired_unconverted', count(*) filter (
          where ends_at <= now()
            and not exists (
              select 1 from public.licenses l
              where l.user_id = trials.user_id and l.status = 'active'
            )
        )
      )
      from public.trials
    ),

    -- Paid vs granted is the distinction the dashboard exists to keep honest.
    -- Every license in production today is a beta grant with an order_id like
    -- 'beta-free-%'; counting them as sales would report 18 customers and a
    -- fictional conversion rate. A license is PAID only if it carries a real
    -- provider order and is not a legacy redemption.
    'licenses', (
      select jsonb_build_object(
        'paid', count(*) filter (
          where status = 'active'
            and order_id is not null
            and order_id not like 'beta-free-%'
            and legacy_token_hash is null
        ),
        'granted', count(*) filter (
          where status = 'active'
            and (order_id like 'beta-free-%' or legacy_token_hash is not null)
        ),
        'refunded',   count(*) filter (where status = 'refunded'),
        'revoked',    count(*) filter (where status = 'revoked'),
        'unattached', count(*) filter (where user_id is null),
        'paid_30d', count(*) filter (
          where status = 'active'
            and order_id is not null
            and order_id not like 'beta-free-%'
            and legacy_token_hash is null
            and purchased_at > now() - interval '30 days'
        )
      )
      from public.licenses
    ),

    -- Active devices. Counted on last_seen_at so these are true "right now"
    -- numbers even before device_checkins has accumulated any history.
    'active', (
      select jsonb_build_object(
        'dau', count(distinct user_id) filter (where last_seen_at > now() - interval '1 day'),
        'wau', count(distinct user_id) filter (where last_seen_at > now() - interval '7 days'),
        'mau', count(distinct user_id) filter (where last_seen_at > now() - interval '30 days'),
        'devices_total', count(*),
        'devices_dau',   count(*) filter (where last_seen_at > now() - interval '1 day')
      )
      from public.devices
      where revoked_at is null
    ),

    'platforms', (
      select coalesce(jsonb_object_agg(platform, n), '{}'::jsonb)
      from (
        select coalesce(platform, 'unknown') as platform, count(*) as n
        from public.devices where revoked_at is null group by 1
      ) t
    ),

    -- Update adoption: who is actually running the version you shipped.
    'versions', (
      select coalesce(jsonb_object_agg(app_version, n), '{}'::jsonb)
      from (
        select coalesce(app_version, 'unknown') as app_version, count(*) as n
        from public.devices where revoked_at is null group by 1
      ) t
    ),

    -- Historical DAU. Empty until the entitlement function has been writing
    -- check-ins for a day; that is expected, not a failure.
    'dau_series', (
      select coalesce(jsonb_agg(jsonb_build_object('day', day, 'active', n) order by day), '[]'::jsonb)
      from (
        select day, count(distinct device_id) as n
        from public.device_checkins
        where day > current_date - 90
        group by day
      ) t
    ),

    'support', (
      select jsonb_build_object(
        'threads', (select count(*) from public.mail_threads),
        'unread',  (select count(*) from public.mail_messages
                     where direction = 'inbound' and read_at is null),
        'sent_30d', (select count(*) from public.sent_emails
                      where created_at > now() - interval '30 days' and status = 'sent'),
        'send_failures_30d', (select count(*) from public.sent_emails
                               where created_at > now() - interval '30 days' and status = 'failed')
      )
    ),

    'refunds', (
      select jsonb_build_object(
        'total',     count(*),
        'submitted', count(*) filter (where status = 'submitted'),
        'refunded',  count(*) filter (where status = 'refunded'),
        'failed',    count(*) filter (where status = 'failed')
      )
      from public.refund_requests
    ),

    'generated_at', to_jsonb(now())
  )
  into result;

  return result;
end;
$$;

comment on function public.admin_metrics() is
  'Counts only, for the admin dashboard. Returns no emails or ids, so the result needs no masking. Service role only.';

-- Nobody but the service role. An anon or authenticated caller reaching this
-- would be reading the whole business through a single RPC.
revoke all on function public.admin_metrics() from public;
revoke all on function public.admin_metrics() from anon, authenticated;
grant execute on function public.admin_metrics() to service_role;
