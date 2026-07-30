# Orchestra email worker

Cloudflare Email Worker for `hello@orchestra-automation.com`. It **forwards**
every message to the mailbox it already went to, and **additionally** posts a
parsed copy to the `mail-ingest` Supabase function so the mail is readable as a
thread in `/admin`.

The forward is the point. `/admin` is a convenience on top of the mailbox, never
a replacement for it — if ingest breaks, mail still arrives exactly where it
always has.

**This was written but not deployed.** Cloudflare credentials were not available
in the session that built it. Everything below is the exact sequence; nothing in
it has been run against the live route.

---

## Before you start

You need:

- `wrangler` (`npm install` here brings it in)
- a Cloudflare login with access to the `orchestra-automation.com` zone
- the destination address currently receiving `hello@` — it must stay a
  **verified destination** in Email Routing, or `message.forward()` fails

Check what the route does today first, because step 5 replaces it:

> Cloudflare dashboard → `orchestra-automation.com` → **Email** → **Email
> Routing** → **Routing rules**. Note the destination on the `hello@` rule.

---

## 1. Install

```sh
cd email-worker
npm install
npx wrangler login          # device flow, needs a browser
```

## 2. Mint the shared secret

One secret, used in two places. 32 bytes of hex — the Supabase function refuses
anything under 32 characters:

```sh
openssl rand -hex 32
```

Keep it on the clipboard for the next two steps. It is **not** the website's
`ADMIN_DATA_SECRET` and must not be set to the same value: Cloudflare and Vercel
are separate trust domains, and the point of two keys is that a compromise of
one does not become a read of the purchase table.

## 3. Give it to Supabase

```sh
supabase secrets set MAIL_INGEST_SECRET=<the hex> --project-ref jxcxtwmqwontjttywxlt
supabase functions deploy mail-ingest --project-ref jxcxtwmqwontjttywxlt
```

## 4. Give it to the Worker, and deploy

```sh
npx wrangler secret put MAIL_INGEST_SECRET     # paste the same hex
npx wrangler secret put FORWARD_TO             # the address from "Before you start"
npx wrangler deploy
```

`FORWARD_TO` is a secret rather than a `[vars]` entry in `wrangler.toml` on
purpose: it is a personal mailbox, and a personal address does not belong in a
file that lives in version control.

`INGEST_URL` **is** in `wrangler.toml` — it is a public URL that 404s everything
unsigned, so it is better reviewable than hidden.

## 5. Bind the route

> Cloudflare dashboard → `orchestra-automation.com` → **Email** → **Email
> Routing** → **Routing rules** → edit the `hello@` rule
> → Action: **Send to a Worker** → `orchestra-email` → Save.

This is the moment mail starts flowing through the Worker. The Worker must
already be deployed (step 4) or it will not appear in the dropdown.

## 6. Verify — before walking away

```sh
npx wrangler tail
```

Then send a message to `hello@orchestra-automation.com` from an outside address
and confirm **all three**:

1. `wrangler tail` shows the invocation with no error
2. the message arrives in the forwarded mailbox, as it always did
3. it appears in `/admin?tab=email` within a few seconds

If (2) fails, roll back immediately (below). If only (3) fails, mail is safe —
check `wrangler tail` for `ingest rejected (404)`, which means the two copies of
`MAIL_INGEST_SECRET` do not match.

## Rollback

> Routing rules → edit the `hello@` rule → Action: **Send to an email** →
> the original destination → Save.

Takes effect immediately. The Worker can be left deployed; with no route bound
it never runs.

---

## Failure behaviour, and why

| What breaks | What happens | Why |
|---|---|---|
| `FORWARD_TO` unset | the Worker **throws**, Cloudflare defers, the sender's MTA retries | mail with nowhere to go must be loudly delayed, never silently dropped |
| `forward()` fails (destination unverified) | same — throws, deferred | ditto |
| Supabase down / bad secret / ingest bug | forward succeeds, error logged, mail **not** in `/admin` | the message has arrived in every sense that matters; an ingest bug must not bounce a support request |
| message over 2 MB | forwarded, not ingested | keeps a newsletter out of the admin database; the mailbox still has it |
| duplicate delivery | ingested once | `mail_messages.dedupe_hash` is unique — see migration `0010` |

## Tests

```sh
deno test --allow-read --allow-net test/
```

Five checks, no Cloudflare account needed. They cover real `postal-mime` parsing
of multipart, HTML-only, attachment and truncated messages — and, most
importantly, that the signature this Worker mints is byte-identical to the one
`supabase/functions/_shared/admin-auth.ts` verifies. That test imports the
server's own implementation rather than restating it, because if the two ever
drift the only symptom in production is mail quietly not appearing.

## Layout

```
src/index.ts     the email() handler — forward first, then best-effort ingest
src/payload.ts   pure: parsed email -> ingest JSON, plus request signing
test/            parsing + signature tests (Deno, no install needed)
wrangler.toml    route config; secrets deliberately absent
```
