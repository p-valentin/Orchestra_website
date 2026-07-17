-- The 3-slot device cap lives in the entitlement function as check-then-insert,
-- so N concurrent activations with distinct fingerprints could all pass the
-- count and exceed the cap. This trigger is the database backstop: it
-- serializes slot changes per user with an advisory transaction lock and
-- recounts, so racers past the cap fail with 'device_limit' — which the
-- entitlement function maps to its usual 409 response.
-- Keep the limit in sync with MAX_ACTIVE_DEVICES in functions/entitlement.

create or replace function public.enforce_device_slot_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  active_count integer;
begin
  -- Only rows becoming active take a slot: inserts of active rows, and
  -- updates that flip revoked_at from set to null.
  if new.revoked_at is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.revoked_at is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('device_slots:' || new.user_id::text));

  select count(*) into active_count
    from public.devices
   where user_id = new.user_id
     and revoked_at is null
     and id <> new.id;

  if active_count >= 3 then
    raise exception 'device_limit';
  end if;

  return new;
end;
$$;

create trigger devices_slot_limit
  before insert or update of revoked_at on public.devices
  for each row execute function public.enforce_device_slot_limit();
