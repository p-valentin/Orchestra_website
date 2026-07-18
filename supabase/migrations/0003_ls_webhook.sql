-- Phase 2: support for the Lemon Squeezy webhook handler.
--
-- Auto-attach on purchase (§3.4c) needs to find an auth account by email.
-- auth.users is not readable by the API roles, so this runs SECURITY DEFINER
-- and is executable by the service role only — the webhook handler is the
-- sole caller.

create or replace function public.user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select id from auth.users
  where lower(email) = lower(trim(p_email))
  order by created_at
  limit 1;
$$;

revoke execute on function public.user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.user_id_by_email(text) to service_role;
