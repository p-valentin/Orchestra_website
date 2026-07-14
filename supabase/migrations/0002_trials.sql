-- Phase 1.5: self-managed 14-day full-feature trial.
-- One trial per account (primary key on user_id) and one per starting device
-- (soft block via starting_fingerprint lookup in the entitlement function).
-- No Lemon Squeezy involvement: LS trials only exist for subscriptions.

create table public.trials (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  started_at           timestamptz not null default now(),
  ends_at              timestamptz not null,
  starting_fingerprint text not null   -- sha256 hex of the device that started it
);
create index trials_fingerprint_idx on public.trials (starting_fingerprint);

-- Same grant discipline as 0001: current Supabase defaults grant no DML on
-- new tables. authenticated reads its own row via RLS; writes are
-- service-role only (no INSERT/UPDATE/DELETE policies).
grant select on public.trials to authenticated;
grant select, insert, update, delete on public.trials to service_role;

alter table public.trials enable row level security;

create policy "read own trial" on public.trials
  for select to authenticated
  using (user_id = auth.uid());
