# Prompt: build the Orchestra email system

Paste everything below the line into a fresh Claude Code session started in
`/home/vali/Orchestra_website`.

---

Build a full email system for Orchestra in `/admin`: an inbox for mail sent to
`hello@orchestra-automation.com`, threaded replies, and outbound sending — all
styled the way the existing transactional mail is.

Read `docs/NEXT-SESSION.md` first for the current state and the traps. Read the
files named below before designing anything; roughly half of this already
exists and the job is mostly to finish and connect it, not to start over.

## What already exists (do not rebuild)

- **`lib/email.ts`** — `sendAsSupport(to, subject, body)` sends from
  `RESEND_FROM` (`Orchestra <hello@orchestra-automation.com>`) with both text
  and HTML parts, wrapping the body in `emailShell()` (dark `#0b0a08` panel,
  brass `#d9b36a` accent, Georgia display face, 520px). It deliberately sets no
  `reply_to` — replies go to the From address. **Never wire `CONTACT_EMAIL`
  into anything customer-facing: it is the owner's personal Gmail.**
- **`supabase/functions/_shared/resend.ts`** — the transactional templates
  (`claimEmailHtml`, `refundEmailHtml`, owner notices). Match this house style;
  do not invent a second one.
- **`public.sent_emails`** (migration `0009`, already applied to production) —
  `to_email, subject, status, provider_id, error, source, created_at`. Holds 18
  rows: 17 `beta-launch`, 1 `support-reply`.
- **`admin-data` Edge Function** — `view: 'emails'` (masked reads) and
  `view: 'record-email'` (a deliberately narrow write). **Committed but NOT
  deployed** — production has the table but not these views. Deploy as part of
  this work.
- **`lib/adminData.ts`** — `SentEmailRow`, `listSentEmails()`.
- **`app/admin/page.tsx`** — tabbed via `?tab=`; there is already an `email`
  tab containing the compose box (`components/AdminEmailForm.tsx`).

## What to build

### 1. Inbound: Cloudflare Email Worker

The domain's MX already points at **Cloudflare Email Routing**, which currently
forwards `hello@` to the owner's personal Gmail. That forward is why Orchestra
mail and personal mail share an inbox.

Write a Worker bound to that route which does **both**:
- `message.forward(<existing destination>)` — the Gmail copy must keep working.
  This is a hard requirement; do not replace the forward with the database.
- parse the MIME (use `postal-mime`) and POST it to an ingest endpoint.

Live in a new top-level `email-worker/` directory with its own
`wrangler.toml`. **You will not be able to deploy it** — Cloudflare credentials
are not available in this environment. Write it, test the parsing locally, and
leave exact deploy instructions in `email-worker/README.md`.

### 2. Ingest endpoint

A new Supabase Edge Function. Authenticate it the way `admin-data` is
authenticated — see `supabase/functions/_shared/admin-auth.ts`: HMAC over
`<ts>.<method>.<path>.<sha256(body)>` with a short freshness window, and
**every failure returns 404** so the endpoint does not advertise itself. Use a
separate secret from `ADMIN_DATA_SECRET`; the Worker is a different trust domain
from the website.

Treat every inbound message as hostile input:
- store the body as text and sanitised HTML — never render raw remote HTML in
  the admin page (an inbound email is attacker-controlled markup aimed at the
  one page holding customer data)
- strip or neutralise remote images and external links' `target`/`rel`
- cap stored size; drop or truncate attachments rather than storing blobs
- do not trust `From` for identity — it is unauthenticated. Show it, don't act
  on it.

### 3. Schema

New tables, following the existing style: RLS enabled, no policies, service
role only, `revoke all ... from anon, authenticated`. Look at `0009` and
`0007_tighten_grants.sql` for the house pattern.

Suggested shape — a `threads` table keyed on a normalised participant +
`Message-ID`/`In-Reply-To`/`References` chain, and a `messages` table with
`direction` (`inbound`/`outbound`), body, headers you actually need, and
`thread_id`. Fold the existing `sent_emails` into it, or keep `sent_emails` as
the send log and reference it — your call, but **do not leave two competing
sources of truth for "what did we send"**; say in the commit message which you
chose and why.

**One design tension to resolve explicitly.** The current system deliberately
stores no email bodies — the audit log and `sent_emails` keep recipient,
subject and outcome only, because that log is read casually and should not
become a second copy of everything ever written to a customer. An inbox cannot
work without bodies. Decide where the line now sits, apply it consistently to
both directions, and write the reasoning into the migration comment. Do not
silently start storing outbound bodies just because inbound ones must be stored.

### 4. Admin UI

Extend the existing `email` tab in `app/admin/page.tsx`:
- a thread list (newest first, unread first), a thread view showing the
  exchange in order, and a reply box that sends via `sendAsSupport` and files
  the outbound message into the same thread
- mark-as-read, and an unread count on the tab label
- keep the existing masking behaviour: addresses masked by default, revealing
  is a deliberate act, so the page stays safe to screenshot
- keep the whole section behind `sensitiveDataUnlocked()` — customer
  correspondence is at least as sensitive as the purchase list
- keep the compose box's two-step arm/confirm for sending; a sent email cannot
  be recalled

### 5. Wire up recording

`sendAdminEmailAction` in `app/admin/actions.ts` currently does not record
sends. Route it through `record-email` so every send lands in the log
regardless of what triggered it.

## Constraints

- **Verify against production, don't assume.** A pushed tag is not a shipped
  release and a created deployment is not a built one — `docs/NEXT-SESSION.md`
  documents both traps, which cost hours on launch day.
- `vercel deploy --prod` does **not** build on this project. Push to `main`;
  the GitHub integration deploys in ~45s.
- Backend tests run from `supabase/`, not the repo root. Currently 130 tests +
  73 matrix checks green — keep them green and add coverage for the new
  ingest path (signature rejection, replay, malformed MIME, oversized body,
  HTML sanitisation).
- Do not send real email to anyone during development. `sendAsSupport` returns
  a clear error when `RESEND_API_KEY` is unset rather than pretending to send;
  keep that property.
- The site is **live with paying customers**. Nothing here should touch
  checkout, licences, or the entitlement path.

## Deliverable

Working inbox and reply flow in `/admin`, the Worker written with deploy
instructions, migrations applied, `admin-data` redeployed, tests green, and a
short note in `docs/NEXT-SESSION.md` describing what shipped and what still
needs the owner's hands (Cloudflare deploy, route binding, secrets).
