-- The support inbox: mail sent to hello@orchestra-automation.com, and the
-- replies we send back, as threads a person can read in /admin.
--
-- Inbound arrives via a Cloudflare Email Worker (email-worker/) bound to the
-- route that already forwards hello@ to the owner's mailbox. The Worker keeps
-- that forward and additionally POSTs the parsed message to the mail-ingest
-- Edge Function. The forward is the safety net: if ingest is down, broken, or
-- rejecting, mail still arrives where it always did.
--
--
-- WHERE THE LINE ON STORING BODIES NOW SITS
--
-- Until now this system deliberately stored no message bodies anywhere. The
-- audit log and public.sent_emails keep recipient, subject and outcome only,
-- on the stated grounds that a log gets read casually and should not quietly
-- become a second copy of everything ever written to a customer.
--
-- An inbox cannot work without bodies, so that rule has to move. It does NOT
-- become "we store everything now". The line moves from
--
--     no bodies anywhere
-- to
--     bodies live in a conversation, never in a log.
--
-- Concretely:
--
--   * The logs keep their old property, unchanged. public.sent_emails gains no
--     body column and neither do the R2 audit entries. You can still scroll
--     Activity, or the send log, without reading anyone's mail.
--   * Bodies live here, in mail_messages, and are reachable only by opening one
--     named thread. The thread LIST carries no preview text for the same
--     reason — a list is a log, and a snippet would put message content back on
--     a casually-read surface through the side door.
--   * The whole section sits behind sensitiveDataUnlocked() (TOTP in
--     production), like the purchase list. Correspondence is at least as
--     sensitive as who bought what.
--
-- BOTH DIRECTIONS, DELIBERATELY. Storing inbound bodies because we must, while
-- quietly also starting to store outbound ones, would be exactly the drift the
-- original rule existed to prevent — so it is decided here rather than
-- discovered later. Outbound bodies ARE stored, because a thread showing only
-- one side of a conversation is worse than no thread at all: you cannot answer
-- somebody without seeing what you already told them, and a half-record is a
-- record that misleads whoever reads it next. The cost is accepted with eyes
-- open: this table is now the most sensitive one in the database, more so than
-- licenses, because free text from customers can contain anything they chose
-- to tell us.
--
-- Consequences that follow from that, and are not optional:
--   * service-role only, like every other table here (RLS on, no policies).
--   * no body ever leaves Supabase except to the admin page, one thread at a
--     time, behind two factors.
--   * bodies are capped (see the check constraints below) so this cannot grow
--     without bound, and attachments are never stored — only their names and
--     sizes. The bytes stay in the mailbox the Worker forwarded to.
--   * retention is a deliberate act, not a default. There is no automatic
--     expiry: a support thread that gets deleted mid-conversation is worse than
--     one kept too long. Pruning is a one-liner the owner runs when they decide
--     the trade has flipped:
--         delete from public.mail_messages where created_at < now() - interval '2 years';
--         delete from public.mail_threads t where not exists
--           (select 1 from public.mail_messages m where m.thread_id = t.id);
--
--
-- WHAT public.sent_emails IS NOW (no second source of truth)
--
-- sent_emails stays exactly what 0009 made it: the SEND LOG. One row per
-- outbound attempt, including failures and including bulk sends that are not
-- conversations at all (the 17 beta-launch rows already in production have no
-- thread and never will). It remains the only answer to "did that go out, to
-- whom, and what did the provider say".
--
-- mail_messages is the CONVERSATION, and carries no delivery state at all: no
-- status, no provider_id, no error column. An outbound message points at its
-- send-log row instead. So the two questions have exactly one home each:
--
--     "did it go out?"      -> sent_emails
--     "what did we say?"    -> mail_messages
--
-- A send that FAILED is logged in sent_emails and filed in no thread: it never
-- reached the customer, so it is not part of the conversation.
--
-- Folding sent_emails into this table was the alternative. Rejected: it would
-- have meant inventing threads for 17 campaign sends that are not exchanges,
-- and rewriting a table that production is already writing to, to buy tidiness
-- rather than clarity.

create table public.mail_threads (
  id                uuid primary key default gen_random_uuid(),

  -- The other party, lowercased and trimmed. Taken from the SMTP envelope
  -- sender rather than the From: header — see mail_messages.from_header for why
  -- the two are kept apart. Unauthenticated either way: this is a grouping key
  -- and a reply-to address, never an identity the system acts on.
  participant_email text not null,

  -- The subject with Re:/Fwd:/AW:/SV: prefixes stripped, whitespace collapsed
  -- and lowercased, so "Re: licence not working" lands on the thread started by
  -- "Licence not working". Computed in the ingest function (normaliseSubject),
  -- not here, so that one implementation is testable in one place.
  subject_key       text not null,

  -- The subject as most recently seen, for display.
  subject           text not null,

  last_message_at   timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

-- The thread key. Also the concurrency guard: two messages arriving at once
-- cannot create two threads for the same conversation — the second insert
-- loses with 23505 and the function falls back to selecting the winner.
create unique index mail_threads_participant_subject_idx
  on public.mail_threads (participant_email, subject_key);

create index mail_threads_last_message_idx
  on public.mail_threads (last_message_at desc);

create table public.mail_messages (
  id             uuid primary key default gen_random_uuid(),
  thread_id      uuid not null references public.mail_threads(id) on delete cascade,
  direction      text not null check (direction in ('inbound', 'outbound')),

  -- Idempotency key: sha256 of the RFC Message-ID when the mail has one, and
  -- of (from, to, subject, body) when it does not. Either way the same delivery
  -- twice yields the same hash, so a Cloudflare retry, a double-bound route or
  -- a captured request replayed inside the signature's freshness window all
  -- collide on the unique index below instead of duplicating the message.
  --
  -- This is what makes the ingest endpoint safe to expose as a WRITE. The read
  -- endpoint (admin-data) can shrug at replay because replaying a read returns
  -- what the caller already had; a write cannot, so the defence lives in the
  -- schema where it cannot be forgotten.
  dedupe_hash    text not null,

  -- Threading headers, as received. Kept because they are how a mail client
  -- would chain the conversation, and they let a thread survive a subject
  -- change mid-exchange.
  message_id     text,
  in_reply_to    text,
  reference_ids  text[] not null default '{}',

  -- Envelope sender for inbound, our own address for outbound.
  from_email     text not null,
  -- The From: header AS RECEIVED. Display only, and displayed as untrusted:
  -- anybody can write anything here. It is kept apart from from_email so that
  -- no query can accidentally treat a claimed identity as a real one.
  from_header    text,
  to_email       text not null,
  subject        text not null,

  -- Bodies. See the note at the top of this file.
  --
  -- body_html is stored SANITISED (mail-ingest strips scripts, styles, event
  -- handlers, remote images, embedded frames and non-http(s) URLs). It is still
  -- not rendered as HTML by the admin page, which renders body_text: an inbound
  -- email is attacker-controlled markup aimed squarely at the one page that
  -- holds customer data, and a sanitiser is a thing that can have bugs. Two
  -- independent barriers, so a hole in either one is not an XSS.
  body_text      text not null default '',
  body_html      text,
  -- True when the body did not fit the caps and was cut. Shown in the UI so a
  -- half-read complaint is never mistaken for the whole of it.
  truncated      boolean not null default false,

  -- Names and sizes only: [{"name": "...", "size": 123, "type": "..."}].
  -- Never the bytes — the attachment itself is in the forwarded mailbox. This
  -- endpoint accepts whatever a stranger sends it, and an object store filled
  -- from that is a liability, not a feature.
  attachments    jsonb not null default '[]'::jsonb,

  -- The receiving MTA's SPF/DKIM/DMARC verdict, as received. Evidence for the
  -- person reading the thread, never an input to a decision here.
  auth_results   text,

  -- Outbound rows point at the send log rather than repeating its status,
  -- provider id and error. Enforced below: an outbound message with no send-log
  -- row would be a claim that we wrote something with no record of sending it.
  -- No ON DELETE action on purpose — the send log is append-only, and a delete
  -- that silently detached a message from its record should fail loudly.
  sent_email_id  uuid references public.sent_emails(id),

  -- Null until somebody opens the thread. Only ever set on inbound rows;
  -- "unread" is not a thing an outbound message can be.
  read_at        timestamptz,

  created_at     timestamptz not null default now(),

  constraint mail_messages_outbound_has_send_log
    check (direction <> 'outbound' or sent_email_id is not null),
  constraint mail_messages_inbound_is_unsent
    check (direction <> 'inbound' or sent_email_id is null),

  -- Backstop caps, well above what mail-ingest truncates to (64 KiB text /
  -- 192 KiB html). They exist so that a bug in the truncation logic fails the
  -- insert loudly instead of quietly filling the table — and failing is safe
  -- precisely because the Cloudflare forward already delivered the mail
  -- elsewhere. Nothing is lost; it just does not appear in /admin.
  constraint mail_messages_body_text_capped check (length(body_text) <= 131072),
  constraint mail_messages_body_html_capped check (body_html is null or length(body_html) <= 393216)
);

create unique index mail_messages_dedupe_idx on public.mail_messages (dedupe_hash);
create index mail_messages_thread_idx on public.mail_messages (thread_id, created_at);
create index mail_messages_message_id_idx on public.mail_messages (message_id)
  where message_id is not null;
-- Drives the unread badge and the unread-first ordering of the thread list, so
-- neither costs a scan of every message body ever received.
create index mail_messages_unread_idx on public.mail_messages (thread_id)
  where direction = 'inbound' and read_at is null;

-- Same posture as every other table here, and the grant pair 0007 requires of
-- any new table in public: RLS on with no policies, so anon and authenticated
-- reach nothing even if a grant is ever widened by accident. Every read and
-- write goes through an Edge Function holding the service role.
alter table public.mail_threads  enable row level security;
alter table public.mail_messages enable row level security;

revoke all on public.mail_threads  from anon, authenticated;
revoke all on public.mail_messages from anon, authenticated;

grant select, insert, update, delete on public.mail_threads  to service_role;
grant select, insert, update, delete on public.mail_messages to service_role;

-- And the grant 0009 forgot.
--
-- 0009 created sent_emails with the revoke half of the pair but not the grant
-- half, leaving service_role's access to come from Supabase's ALTER DEFAULT
-- PRIVILEGES. In PRODUCTION that happened to work — the project is old enough
-- that table creation still granted DML to service_role, and it is there today
-- (verified, not assumed). On a database built from these migrations now it
-- does NOT: service_role gets REFERENCES/TRIGGER/TRUNCATE and no
-- select/insert, so every write through admin-data fails with "permission
-- denied for table sent_emails".
--
-- That is the exact fragility 0007 was written to remove — an invariant held up
-- by a platform default rather than by a line in a migration — and it would
-- have surfaced as the email log silently not recording anything the first
-- time the table was rebuilt. Stated explicitly here so it holds in both
-- places. A no-op against production; the fix everywhere else.
grant select, insert, update, delete on public.sent_emails to service_role;
