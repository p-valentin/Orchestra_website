-- Phase 1: licensing schema. One source of truth: public.licenses.
-- Lemon Squeezy (Phase 2) and legacy tokens are both just inputs that create
-- rows here. All writes go through Edge Functions with the service role;
-- authenticated clients get read-only access via RLS.

-- Licenses: one row per purchase, regardless of origin (Lemon Squeezy or legacy)
create table public.licenses (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users(id) on delete set null,
  ls_order_id       text unique,          -- Lemon Squeezy order id; null for legacy
  legacy_token_hash text unique,          -- sha256 hex of full legacy token; null for LS
  buyer_email       text not null,        -- lowercased, trimmed
  status            text not null default 'active'
                    check (status in ('active','refunded','revoked')),
  plan              text not null default 'lifetime',
  purchased_at      timestamptz not null default now(),
  claimed_at        timestamptz,          -- when attached to a user account
  created_at        timestamptz not null default now(),
  check (ls_order_id is not null or legacy_token_hash is not null)
);
create index licenses_email_idx on public.licenses (buyer_email);
create index licenses_user_idx  on public.licenses (user_id);

-- Devices: activation slots, max 3 active per user (enforced in the
-- entitlement Edge Function; revoked_at null = active slot)
create table public.devices (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  fingerprint_hash text not null,         -- sha256 hex of client machine id
  name             text,
  platform         text check (platform in ('windows','macos','linux')),
  app_version      text,
  last_seen_at     timestamptz not null default now(),
  revoked_at       timestamptz,
  created_at       timestamptz not null default now(),
  unique (user_id, fingerprint_hash)
);

-- Webhook events: created now, consumed in Phase 2. Unique constraint = idempotency.
create table public.webhook_events (
  id           bigint generated always as identity primary key,
  provider     text not null default 'lemonsqueezy',
  event_id     text not null,
  event_name   text,
  payload      jsonb not null,
  processed_at timestamptz,
  received_at  timestamptz not null default now(),
  unique (provider, event_id)
);

-- Data-access grants. Current Supabase defaults grant no DML on new tables,
-- so spell out exactly who can do what: authenticated gets SELECT only (rows
-- scoped by the RLS policies below), service_role gets full DML for the Edge
-- Functions, anon gets nothing. webhook_events is service-role only.
grant select on public.licenses, public.devices to authenticated;
grant select, insert, update, delete
  on public.licenses, public.devices, public.webhook_events to service_role;
grant usage, select on all sequences in schema public to service_role;

-- RLS: clients may read their own rows; every write path is service-role only
-- (no INSERT/UPDATE/DELETE policies exist, so RLS denies them for clients).
alter table public.licenses       enable row level security;
alter table public.devices        enable row level security;
alter table public.webhook_events enable row level security;

create policy "read own licenses" on public.licenses
  for select to authenticated
  using (user_id = auth.uid());

create policy "read own devices" on public.devices
  for select to authenticated
  using (user_id = auth.uid());

-- webhook_events: intentionally no policies at all — service role only.
