# Where things stand — 2026-07-29

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
| Website | `main` @ `7c8e604` |
| App | `main` @ `d3f7e6f`, tag `v1.2.0` |

The 17 beta lifetime licences were emailed at 16:16 UTC — 17/17 accepted,
one message each, no BCC, recorded in `public.sent_emails` (source
`beta-launch`). Exact copy in `beta-launch-email.md`.

---

## Unfinished

### 1. `/admin` email log — half-built, inert

The **backend exists and is committed**; the **UI does not**. Nothing calls the
new code, so this is incomplete rather than broken.

Done:
- migration `0009_sent_emails` — **already applied to production**
- `admin-data`: `view: 'emails'` (masked reads) and `view: 'record-email'`
  (the one narrow write it accepts)
- `lib/adminData.ts`: `SentEmailRow`, `listSentEmails()`

Remaining:
- [ ] an Email-tab section in `app/admin/page.tsx` rendering `listSentEmails()`
- [ ] wire `sendAdminEmailAction` (`app/admin/actions.ts`) to record via
      `record-email`, so future compose-box sends land in the log too
- [ ] **redeploy the `admin-data` Edge Function** — production currently has
      the table but not the function changes:
      `supabase functions deploy admin-data --project-ref jxcxtwmqwontjttywxlt`

### 2. Inbound mail → `/admin` (requested, not started)

The owner wants replies to `hello@orchestra-automation.com` readable in
`/admin` **and** still arriving in Gmail. Both are possible in one handler.

MX already points at **Cloudflare Email Routing** (not Google), which forwards
to the personal Gmail — that forward is why Orchestra mail and personal mail
share an inbox. A Cloudflare Email Worker can `message.forward()` to keep the
Gmail copy while POSTing the parsed mail to an ingest endpoint. Needs a MIME
parser (`postal-mime`), an authenticated endpoint, a messages table, an Inbox
tab — and **Cloudflare deploy credentials, which this session did not have**.

### 3. Owner-only chores

- [ ] disable the Paddle notification destination in Paddle's dashboard
      (the function, its source and its secrets are already gone)
- [ ] revoke the sandbox Polar token (appeared in a transcript, now unused)
- [ ] **rotate the Resend key** — it was pasted into a chat transcript on
      2026-07-29. Send-only restricted, but "send as your domain" is the
      phishing-relevant capability.

### 4. Watch for

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
`SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`. Currently **130 tests + 73
matrix checks** green.
