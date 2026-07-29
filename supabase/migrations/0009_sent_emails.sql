-- A record of every message sent from the support address.
--
-- The /admin audit log already notes sends, but it lives in R2 and is only
-- written by the deployed website, so anything sent another way (a one-off
-- announcement script, a future backend job) leaves no trace the owner can
-- see. Mail to customers is the one admin action that reaches outside the
-- system and cannot be undone; "did that actually go out, and to whom" should
-- be answerable from one place regardless of what did the sending.
--
-- Deliberately NOT the message body. Same reasoning as the audit entries: this
-- gets read casually and should not become a second copy of everything ever
-- written to a customer. Recipient, subject and outcome are what triage needs.
--
-- provider_id is Resend's message id, which is the handle for asking Resend
-- what happened to a specific message — the thing you actually want when
-- somebody says they never received it.
create table public.sent_emails (
  id          uuid primary key default gen_random_uuid(),
  to_email    text not null,
  subject     text not null,
  status      text not null check (status in ('sent', 'failed')),
  provider_id text,
  error       text,
  -- Which flow sent it: 'admin-form' for the compose box, or a campaign name.
  source      text not null default 'admin-form',
  created_at  timestamptz not null default now()
);

create index sent_emails_created_at_idx on public.sent_emails (created_at desc);

-- Service role only, like every other table here: RLS on with no policies, so
-- anon and authenticated can reach nothing even if a grant is ever widened.
alter table public.sent_emails enable row level security;

revoke all on public.sent_emails from anon, authenticated;
