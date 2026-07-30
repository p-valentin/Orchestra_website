# Where things stand — 2026-07-30

Orchestra **1.2.0 is launched and live**. This file is the handover: what is
true now, what is unfinished, and the traps that already cost time once.

---

## Verified live

Checked against production, not inferred:

| Thing | State |
|---|---|
| Sign-up | open |
| `POST /api/checkout` | **401** (auth required) — paid path live |
| Price | `$149`, confirmed on Polar's own checkout: $149 subtotal / $149 total, one-time |
| Downloads | Linux / macOS / Windows all resolve to real files |
| Auto-update | `latest.yml`, `latest-linux.yml`, `latest-mac.yml` all at 1.2.0 |
| Website | `main` @ `72ccde5`, deployment READY and aliased to www — the three commits before it all failed to build, see below |
| App | `main` @ `d3f7e6f`, tag `v1.2.0` |

The 17 beta lifetime licences were emailed at 16:16 UTC — 17/17 accepted,
one message each, no BCC, recorded in `public.sent_emails` (source
`beta-launch`). Exact copy in `beta-launch-email.md`.

---

## The email system — shipped, except the Cloudflare half

Both items that used to be listed here as unfinished (the inert `/admin` email
log, and inbound mail) are now built. The website side is **live**; the
inbound side is written and waiting on Cloudflare credentials, which this
session did not have either.

### What is live now

Verified against production, not inferred:

| Thing | State |
|---|---|
| migration `0010_mail_inbox` | applied — `mail_threads`, `mail_messages`, RLS on, no policies, no anon/authenticated grants |
| `admin-data` | **v9 deployed** — `threads`, `thread`, `thread-read`, `mail-unread` added; `purchases`/`refunds` unchanged and still returning masked rows |
| `mail-ingest` | **v2 deployed**, `verify_jwt = false`, 404s everything (its secret is not set — see below) |
| `/admin?tab=email` | inbox + thread view + reply box + compose box, behind TOTP |
| Backend tests | **173 pass** (was 130) |
| Worker tests | 5 pass, no Cloudflare account needed |

### What still needs your hands

Everything left is Cloudflare, and it is all in **`email-worker/README.md`** —
that file is the deploy runbook, written to be followed top to bottom. In short:

- [ ] `openssl rand -hex 32` — one secret, set in **both** places:
      `supabase secrets set MAIL_INGEST_SECRET=… --project-ref jxcxtwmqwontjttywxlt`
      and `wrangler secret put MAIL_INGEST_SECRET`.
      **Not** the same value as `ADMIN_DATA_SECRET` — separate trust domains is
      the whole point of it being a second key.
- [ ] `wrangler secret put FORWARD_TO` — the mailbox `hello@` forwards to today.
      A secret rather than a `[vars]` entry because it is a personal address and
      does not belong in a file under version control.
- [ ] `wrangler deploy`, then bind the route: Cloudflare → Email → Email Routing
      → the `hello@` rule → **Send to a Worker** → `orchestra-email`.
- [ ] verify with `wrangler tail` **and** an actual test message, checking all
      three: no error in the tail, the mail still lands in the forwarded
      mailbox, and it appears in `/admin?tab=email`.

Until that route is bound, nothing changes: mail keeps arriving exactly where it
does today, and the inbox tab simply stays empty.

**Rollback is one dropdown** — set the routing rule back to *Send to an email*.

### Design decisions worth knowing before changing anything

- **Bodies now exist, in exactly one place.** The old rule was "no message
  bodies anywhere". It has moved to *bodies live in a conversation, never in a
  log* — `sent_emails` and the R2 audit entries still hold recipient, subject
  and outcome only, and the thread LIST carries no preview text for the same
  reason. Applied to **both** directions deliberately, not drifted into. The
  reasoning is written at the top of `migrations/0010_mail_inbox.sql`; read it
  before adding a body column anywhere else.
- **One source of truth for "did that go out": `sent_emails`.** `mail_messages`
  has no status, no provider_id, no error — an outbound row points at its
  send-log row instead. A *failed* send is logged and filed in no thread.
- **Inbound HTML is stored sanitised and still never rendered as HTML.** The
  page renders `body_text`; `body_html` is not even returned by the Edge
  Function. Two independent barriers, because a sanitiser is a thing that can
  have bugs and the page it would fail on is the one holding customer data.
- **Replying never needs an address on screen.** The reply form posts a thread
  id; the server resolves the recipient from it. That is what lets the inbox
  stay masked and still be answerable — and it means a tampered form field
  cannot redirect a reply to somebody else under our domain.
- **`In-Reply-To` is attacker-controlled.** The reference chain is only followed
  within the same participant, so nobody can drop their text into another
  customer's thread. There is a test for it (`mail-ingest.test.ts` case 101).

### Three things found on the way

- **Production had not built for three commits.** `7c8e604`, `4c2492c` and
  `4202e7b` all pushed to `main`, all created a deployment, and all **ERRORed**
  in the build — so the live site was still serving `a42602c` from launch day,
  and nothing said so. The cause was a type error introduced by `7c8e604`
  itself: `listSentEmails()` called `query('emails', …)` while `query` was typed
  `'purchases' | 'refunds'`. `npm run build` type-checks; nothing else did.
  Fixed here as a side effect of widening that function, and the build that
  carried this work is the **first green production build since launch day**.

  This is the same trap as the Windows release leg, in a second place: *a
  created deployment is not a built one*. After pushing to `main`, check the
  state, not just that the push landed —

  ```sh
  # or the dashboard; the MCP server's list_deployments shows state per commit
  curl -s -o /dev/null -w '%{http_code}\n' https://www.orchestra-automation.com/
  ```

  …and confirm the deployment whose `githubCommitSha` is yours reads `READY`,
  not `ERROR`. A stale-but-working site looks exactly like a fresh one.

- **`0009` never granted `sent_emails` to `service_role`.** Production has the
  grant by accident of when the table was created; a database built from the
  migrations today does not, and every write through `record-email` fails with
  *permission denied*. `0010` states the grant explicitly. This is exactly the
  fragility `0007` was written to remove — if you add a table to `public`, end
  the migration with the revoke/grant pair.
- **`vercel deploy --prod` is still broken here** (below), and the Supabase CLI
  in this environment has no access token, so both Edge Functions were deployed
  through the Supabase MCP server instead. `supabase functions deploy` needs
  `supabase login` (a browser device flow) first.

### Owner-only chores

- [ ] disable the Paddle notification destination in Paddle's dashboard
      (the function, its source and its secrets are already gone)
- [ ] revoke the sandbox Polar token (appeared in a transcript, now unused)
- [ ] **rotate the Resend key** — it was pasted into a chat transcript on
      2026-07-29. Send-only restricted, but "send as your domain" is the
      phishing-relevant capability.

### Watch for

Beta users who sign up with a **different address** than the one they were
emailed get a 14-day trial instead of their licence, silently — the licence
attaches by email match and there is no error explaining the miss. The email
tells them to reply and have it moved. Expect a few on `hello@`.

---

## Traps that already cost time

**A pushed tag is not a shipped release.** `v1.2.0` was tagged, Linux and macOS
uploaded, and the **Windows leg had failed** — no notification, just a missing
artifact. It surfaced only because the download 404'd, by which point
`liveVersion()` was already 1.2.0 and real visitors were being sent to a file
that did not exist. The cause was `expected 438 to be 384` — 0o666 vs 0o600, a
test asserting POSIX file modes on Windows, which has no mode bits. 765 of 766
passed and the build never reached packaging.

After tagging, confirm all four:

```sh
gh run view <id> --json jobs --jq '.jobs[] | "\(.name) \(.conclusion)"'   # every leg success
curl -sI https://downloads.orchestra-automation.com/Orchestra-1.2.0.AppImage       # 200
curl -s  https://downloads.orchestra-automation.com/latest.yml | head -1           # new version
curl -s -o /dev/null -w '%{redirect_url}' 'https://www.orchestra-automation.com/api/download?platform=win'
```

`gh` lives at `~/.local/bin/gh`. Both repos are **private**, so the
unauthenticated API 404s — `gh auth login` uses a device flow the owner must
complete in a browser.

**`vercel deploy --prod` does not work on this project.** Two attempts sat at
`status UNKNOWN` with a `0ms` build for 20+ minutes and never started
(dashboard: *Blocked*). No error. **Push to `main` instead** — the GitHub
integration completes in ~45s. `git commit --allow-empty` is a legitimate way
to force a rebuild.

**`NEXT_PUBLIC_*` is inlined at build time.** Setting a flag in Vercel changes
nothing about the deployment already serving production. This is why launch
first appeared not to work: both flags were set, and sign-up stayed closed.
Set the var, **then** trigger a build, then verify against the live site:

```sh
curl -s .../signup | grep -q "Accounts open at launch"   # match = still closed
curl -s -o /dev/null -w '%{http_code}' -X POST .../api/checkout -d '{}'
# 401 = paid live (auth required) · 503 = still disabled in the served bundle
```

**`vercel env add` marks values sensitive by default**, and `vercel env pull`
then returns the literal string `[SENSITIVE]` — you cannot read back what you
wrote. For non-secret config use
`--value X --no-sensitive --force --yes` so it stays verifiable.

**`CONTACT_EMAIL` is a personal Gmail.** It is where owner notifications land,
never something a customer may see. `sendAsSupport` once set it as `reply_to`,
which would have put that address in the reply-to of every support mail; fixed
by dropping `reply_to` so replies go to the From address. Do not wire
`CONTACT_EMAIL` into anything customer-facing.

**Run the backend tests from `supabase/`,** not the repo root — its `deno.json`
sets `nodeModulesDir: none`; from the root Deno tries the root `node_modules`
and fails on `npm:jose`. Integration tests need
`eval "$(supabase status -o env)"` exported as `SUPABASE_URL` /
`SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`. Currently **173 tests** green (130 before the email system).

The Cloudflare Worker's own tests are separate and need no stack:
`cd email-worker && deno test --allow-read --allow-net test/`.
