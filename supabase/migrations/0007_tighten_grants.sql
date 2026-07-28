-- Restore the grant layer that 0001 intended but the project's default
-- privileges quietly overrode.
--
-- Found 2026-07-28 while adding refund_requests: EVERY table in public —
-- licenses, devices, trials, webhook_events and the new refund_requests —
-- carried INSERT/UPDATE/DELETE/TRUNCATE for both `anon` and `authenticated`,
-- because Supabase's ALTER DEFAULT PRIVILEGES grants them on table creation
-- and a later `grant select` adds to that rather than replacing it.
--
-- Nothing was exploitable: RLS is enabled on all five tables and each has only
-- a SELECT policy, so every write was already denied. But SECURITY-REVIEW.md
-- claimed two independent layers ("the `authenticated` grant is SELECT-only;
-- `anon` gets nothing") and in production there was one. A single
-- `disable row level security`, a table rebuilt without its policy, or a
-- policy edited to `using (true)` would have turned a read leak into a write
-- one. This migration makes the second layer real.
--
-- Deliberately not touching ALTER DEFAULT PRIVILEGES: that is Supabase's to
-- manage, and fighting it invites drift. Instead every future migration that
-- creates a table in public must end with the same revoke/grant pair, and the
-- rls test suite asserts the end state.

-- anon has no business with any of these: every policy is `to authenticated`,
-- so anon could never read a row anyway — this removes the write grants that
-- outlived their usefulness.
revoke all on public.licenses        from anon;
revoke all on public.devices         from anon;
revoke all on public.trials          from anon;
revoke all on public.refund_requests from anon;
revoke all on public.webhook_events  from anon;

-- authenticated reads its own rows (RLS decides which) and writes nothing.
-- Every write path goes through an Edge Function with the service role.
revoke all on public.licenses        from authenticated;
revoke all on public.devices         from authenticated;
revoke all on public.trials          from authenticated;
revoke all on public.refund_requests from authenticated;
revoke all on public.webhook_events  from authenticated;

grant select on public.licenses        to authenticated;
grant select on public.devices         to authenticated;
grant select on public.trials          to authenticated;
grant select on public.refund_requests to authenticated;
-- webhook_events stays service-role only: raw payment payloads, no policy, no
-- reason for a client to see them.

-- service_role is unchanged and explicit rather than inherited.
grant select, insert, update, delete on public.licenses        to service_role;
grant select, insert, update, delete on public.devices         to service_role;
grant select, insert, update, delete on public.trials          to service_role;
grant select, insert, update, delete on public.refund_requests to service_role;
grant select, insert, update, delete on public.webhook_events  to service_role;
