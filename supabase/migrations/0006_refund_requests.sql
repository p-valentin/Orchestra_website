-- Self-serve refunds. A buyer inside the 14-day window refunds themselves from
-- /account; the money moves immediately via Polar's API and the resulting
-- order.refunded webhook deactivates the licence through the existing path.
--
-- This table is the RECORD of the request, not the state of the licence —
-- public.licenses.status remains the single source of truth for entitlement.
-- Its jobs are (a) capturing why, which is the whole point of asking, and
-- (b) being the concurrency guard that stops a double-click becoming a double
-- refund.

create table public.refund_requests (
  id                  uuid primary key default gen_random_uuid(),
  license_id          uuid not null references public.licenses(id) on delete cascade,
  user_id             uuid references auth.users(id) on delete set null,
  order_id            text not null,          -- denormalised: survives licence deletion in exports
  reason              text not null
                      check (reason in (
                        'not_what_expected','missing_feature','too_difficult',
                        'bugs','too_expensive','bought_by_mistake','other'
                      )),
  detail              text,                   -- free text, optional, capped in the function
  status              text not null default 'submitted'
                      check (status in ('submitted','refunded','failed')),
  provider_refund_id  text,                   -- Polar's refund id once it succeeds
  failure_reason      text,                   -- why the provider call failed, for triage
  amount_cents        integer,
  currency            text,
  created_at          timestamptz not null default now(),
  completed_at        timestamptz
);

create index refund_requests_license_idx on public.refund_requests (license_id);
create index refund_requests_created_idx on public.refund_requests (created_at desc);

-- The double-refund guard, and the reason it is an index rather than a check
-- in application code: two concurrent clicks are two concurrent transactions,
-- and only the database can serialise them. At most ONE non-failed request may
-- exist per licence, so the second insert loses with 23505 and the function
-- turns that into a 409 instead of a second call to Polar. A failed attempt
-- leaves the buyer free to try again.
create unique index refund_requests_one_open_per_license
  on public.refund_requests (license_id)
  where status <> 'failed';

-- Same posture as every other table here: the service role (Edge Functions)
-- writes, clients read only their own rows, nobody writes from the browser.
grant select on public.refund_requests to authenticated;
grant select, insert, update, delete on public.refund_requests to service_role;

alter table public.refund_requests enable row level security;

create policy "read own refund requests" on public.refund_requests
  for select to authenticated
  using (user_id = auth.uid());
