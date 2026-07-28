# Orchestra licensing — Phases 1, 1.5 & 2 backend

Supabase backend for the $149 lifetime license: schema + RLS, entitlement
issuance, device management, legacy license migration, the self-managed
14-day trial (Phase 1.5), and payments via webhooks (Phase 2). The payment
processor has moved twice — Lemon Squeezy → Paddle → **Polar** — and each
time the change was confined to one provider module plus its webhook handler,
which is what the surface was designed for. Desktop integration is Phase 3.

## Layout

```
supabase/
  migrations/0001_licensing.sql     schema + RLS (licenses, devices, webhook_events)
  migrations/0002_trials.sql        Phase 1.5: trials table + RLS
  migrations/0003_ls_webhook.sql    Phase 2: user_id_by_email() for auto-attach
  migrations/0004_paddle.sql        Phase 2: provider switch (order_id column)
  functions/
    _shared/                        token signing, legacy verification, http plumbing
    entitlement/                    POST /entitlement — issue 7-day EdDSA JWT
    devices/                        GET /devices, POST /devices/deactivate
    claim-legacy/                   POST /claim-legacy — redeem old-format license keys
    webhooks-paddle/                POST /webhooks-paddle — Paddle events (public, being retired)
    webhooks-polar/                 POST /webhooks-polar — Polar events (public, current)
  tests/
    unit/                           pure logic, no stack needed
    integration/                    §8 cases 1–21, needs local stack
  mcp/server.ts                     MCP server for interactive testing (.mcp.json)
scripts/
  generate-keys.ts                  mint the ENTITLEMENT_PRIVATE_KEY pair
  derive-legacy-public-key.ts       LEGACY_SIGNING_KEY from the website's LICENSE_PRIVATE_KEY
  setup-test-env.ts                 throwaway keys for a local test run
  seed-legacy.ts                    optional: pre-seed licenses from claim records
```

## Secrets

| Secret | What | How to get it |
| --- | --- | --- |
| `ENTITLEMENT_PRIVATE_KEY` | Ed25519 PKCS8 PEM (or base64 of it) that signs entitlement JWTs | `deno run scripts/generate-keys.ts` — keep the JWK it prints for the Phase 3 client |
| `LEGACY_SIGNING_KEY` | Ed25519 **public** key (SPKI PEM or base64 of it) that verifies old license keys | `LICENSE_PRIVATE_KEY=… deno run scripts/derive-legacy-public-key.ts` |

The legacy format was confirmed from the website's `lib/token.ts`: Ed25519
(not HMAC), token = `base64url(payloadJson).base64url(sig)`, signature over
the UTF-8 bytes of the base64url body string. Verification only needs the
public key, so the website's private key never leaves Vercel.

Set them with:

```sh
supabase secrets set ENTITLEMENT_PRIVATE_KEY=... LEGACY_SIGNING_KEY=...
```

(`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.)

## Run migrations

```sh
supabase db push            # against the linked project
# or locally:
supabase start              # applies supabase/migrations/ on boot
```

## Run the tests

Unit tests (no stack needed):

```sh
deno test -A supabase/tests/unit
```

Integration tests (§8 cases 1–21) need Docker + the Supabase CLI:

```sh
supabase start
deno run -A scripts/setup-test-env.ts        # throwaway signing keys
supabase functions serve --env-file supabase/functions/.env.test &

set -a; eval "$(supabase status -o env)"; set +a   # exports API_URL, ANON_KEY, SERVICE_ROLE_KEY
deno test -A supabase/tests
```

## Interactive testing (MCP)

`.mcp.json` registers an `orchestra-license-test` MCP server (approve it when
Claude Code asks on next launch). It targets the local stack automatically via
`supabase status`, or a hosted project when `SUPABASE_URL` /
`SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` are set. Tools:

- `stack_status` — where it's pointed, whether functions are reachable
- `setup_test_keys` — throwaway signing keys (`.env.test` + `.keys.test.json`)
- `create_test_user` — confirmed auth user, remembered by email
- `seed_license` — insert any license shape (active/refunded/revoked, claimed
  or unclaimed, LS or legacy origin)
- `mint_legacy_token` — real signed legacy tokens, plus `include_exp`
  (app-token) and `tamper` variants that must be rejected
- `claim_legacy`, `request_entitlement`, `list_devices`, `deactivate_device` —
  drive the endpoints as that user; entitlement responses get their JWT
  verified against the test public key
- `db_rows` — service-role reads to assert what was written
- `cleanup_test_data` — remove everything the session created

Phase 1.5 additions: `seed_trial` / `warp_trial` (reposition a trial in time —
`days_in: 13` → capped token, `15` → expired), `set_license_status` (simulate
the Phase 2 refund/revoke webhook), and `trials` in `db_rows`.

Example flow: `setup_test_keys` → serve functions with `.env.test` →
`create_test_user` → `seed_license` (unclaimed, same email) →
`request_entitlement` (watch auto-claim + verified JWT) → repeat with new
`device_name`s until `409 device_limit` → `deactivate_device` → retry →
`cleanup_test_data`.

The whole matrix is also scripted: `deno run -A mcp/run-matrix.ts` (from
`supabase/`) spawns the server on its real stdio transport and runs ~57
checks covering every scenario above end to end.

## Polar (Phase 2, current processor)

Paddle rejected the merchant application, so the live processor is **Polar**
(also a merchant of record). The swap touched only the provider surface —
schema, entitlement logic, device binding and the trial are unchanged.
`webhooks-paddle` is kept deployed until Polar is verified in sandbox, then
deleted.

`POST /functions/v1/webhooks-polar` — public (`verify_jwt = false`);
authentication is the [Standard Webhooks](https://www.standardwebhooks.com/)
scheme Polar implements: headers `webhook-id`, `webhook-timestamp`,
`webhook-signature` (`v1,<base64>`, space-delimited list for rotation), HMAC-
SHA256 over `"<id>.<ts>.<raw body>"`, verified constant-time with a 300 s
replay window before anything is parsed. All Polar payload knowledge lives in
`functions/_shared/polar.ts`.

> **Secret gotcha.** Polar's docs say the secret "is expected to be base64
> encoded", but their SDK base64-*encodes* the dashboard string before handing
> it to the Standard Webhooks library, which base64-*decodes* it. The two
> cancel out: the HMAC key is the plain UTF-8 bytes of the secret as shown in
> the dashboard. Set `POLAR_WEBHOOK_SECRET` to that literal string — pre-
> encoding it produces silent 401s.

- **Idempotency**: keyed on the `webhook-id` **header** — unlike Paddle, the
  Polar payload carries no event id at all. The id is inside the signed
  content, so a captured delivery can't be replayed under a fresh id to dodge
  the dedupe. Store-first, release-on-failure semantics live in
  `_shared/webhook-events.ts` (same table, same 24-month retention sweep the
  Paddle path uses).
- **Buyer email** needs no lookup: `order.paid` carries
  `data.customer.email` inline.
- **Account binding is metadata-only.** `data.metadata.user_id` (set
  server-side by `/api/checkout` from a verified JWT) is the sole attach path;
  there is deliberately **no** email fallback here, so an email edited at
  checkout can't misdirect a license. Absent/unresolvable → recorded
  unclaimed and logged; the buyer recovers it by signing in, where
  `/entitlement` auto-claims against their own confirmed address. The attach
  is guarded on `user_id IS NULL`, so it can fill an empty slot but never
  re-point an owned one.
- **order.paid**: conflict-ignoring upsert on `order_id`, then attach, then
  the claim email to the ACCOUNT's address (Resend, best-effort). An order
  with a `subscription_id` is stored and skipped — we sell no subscriptions.
- **Refunds**: `order.refunded` (any status, including `partially_refunded`)
  and `refund.created`/`refund.updated` with `status: "succeeded"` both
  revoke. Chargebacks need no branch — Polar surfaces a dispute as a Refund
  carrying a `dispute` object. There is **no dispute-resolution webhook**, so
  reinstating a license after a won dispute is a manual admin action. A refund
  arriving before its purchase CREATES the row as refunded, and the late
  purchase cannot resurrect it.
- Unknown event types: stored, 200, no-op.

New secrets: `POLAR_WEBHOOK_SECRET` (the endpoint secret from the Polar
dashboard), `POLAR_API_KEY` + `POLAR_ENV` (self-serve refunds call Polar's API;
the key needs the `refunds:write` scope, and `POLAR_ENV=sandbox` points it at
sandbox-api.polar.sh), `OWNER_EMAIL`, `ADMIN_DATA_SECRET`. Website side:
`POLAR_ACCESS_TOKEN` (server-only), `NEXT_PUBLIC_POLAR_PRODUCT_ID`,
`NEXT_PUBLIC_POLAR_ENV`, `ADMIN_DATA_SECRET`, `ADMIN_TOTP_SECRET`.

**Who gets which email.** Four templates, two audiences, and the split matters
because the internal ones carry another customer's address and the sentence
they wrote about why they left:

| Email | Recipient | Audience |
|---|---|---|
| Purchase confirmation (`sendClaimEmail`) | the licence's account address | customer |
| Refund confirmation (`sendRefundEmail`) | the licence's account address | customer |
| Refund alert (`sendOwnerRefundNotice`) | `OWNER_EMAIL` | internal |
| Refund FAILED (`sendOwnerRefundFailure`) | `OWNER_EMAIL` | internal |

The owner address is never derived from the buyer — it is read from
`OWNER_EMAIL` only, falling back to `SUPPORT_EMAIL`
(`hello@orchestra-automation.com`). Keep `OWNER_EMAIL` pointed at a business
inbox rather than a personal one: an owner address that is also a customer
account makes the two flows indistinguishable while testing, and puts customer
PII somewhere it does not belong.

**Polar dashboard checklist**: start in the SANDBOX (sandbox.polar.sh —
separate account, separate token and product id) · product "Orchestra
Lifetime", one-time, $149 · Settings → Webhooks → Add Endpoint: the deployed
function URL, format **Raw**, events `order.paid`, `order.refunded`,
`refund.created`, `refund.updated` · copy the secret into
`POLAR_WEBHOOK_SECRET` · do **not** enable Polar's built-in License Key
benefit — Orchestra's account *is* the license, and a second key source would
be a second source of truth. Test card `4242 4242 4242 4242`; never a real
card in sandbox (Polar flags that as card testing). Go-live = the production
Polar org's token, product id and endpoint secret, and
`NEXT_PUBLIC_POLAR_ENV=production`.

## Paddle (Phase 2, superseded — kept until Polar is verified)

`POST /functions/v1/webhooks-paddle` — public (`verify_jwt = false`);
authentication is the `Paddle-Signature` header (`ts=…;h1=…`, HMAC-SHA256
over `"<ts>:<raw body>"`), verified constant-time with a 300s replay window
before anything is parsed. All Paddle payload knowledge lives in
`functions/_shared/paddle.ts` so the provider stays swappable (this file
replaced `lemonsqueezy.ts` — nothing else in the license system changed).

- **Idempotency**: every event inserts into `webhook_events` first, keyed by
  Paddle's globally unique `event_id`; a duplicate returns 200 and stops. If
  processing fails after that insert, the event row is deleted before the 500
  so the Paddle retry can reprocess.
- **Buyer email**: Paddle transactions carry `customer_id`, not an email.
  Resolution: stored `customer.created/updated` event → Paddle API
  (`PADDLE_API_KEY`, `PADDLE_API_BASE_URL` for sandbox) → otherwise the event
  is released and the handler 500s so the retry succeeds once the customer
  event lands. A license row is never created without a normalized email —
  auto-claim depends on it.
- **transaction.completed**: conflict-ignoring insert on `order_id`, instant
  attach when an account with the buyer email exists (`user_id_by_email`),
  then the claim email (Resend, best-effort — a failure never fails the
  webhook).
- **Refunds arrive as `adjustment.*`** with `action: "refund"`; only
  `status: "approved"` acts (pending approvals don't revoke). A refund
  arriving before its purchase CREATES the row as refunded, and the late
  purchase cannot resurrect it.
- Unknown event types: stored, 200, no-op — never 4xx an event we merely
  don't care about.
- Claim email (§4): no license keys in it, the account is the license; both
  paths point at `SITE_URL` (accounts live in the desktop app).

New secrets: `PADDLE_WEBHOOK_SECRET` (the notification destination's
`pdl_ntfset_…` secret), `PADDLE_API_KEY` (email fallback; recommended),
`PADDLE_API_BASE_URL` (`https://sandbox-api.paddle.com` while in sandbox),
`RESEND_API_KEY` (+ optional `RESEND_FROM`, `SITE_URL`; tests set
`RESEND_BASE_URL` to a dead port to exercise the failure path).

**Paddle dashboard checklist (manual, §5)**: start in the SANDBOX
(sandbox.paddle.com — separate free account) · product "Orchestra Lifetime",
one-time, $129 · Developer Tools → Notifications → new destination: the
deployed function URL, events `transaction.completed`, `customer.created`,
`customer.updated`, `adjustment.created`, `adjustment.updated` · copy the
secret into `PADDLE_WEBHOOK_SECRET` · API key into `PADDLE_API_KEY` ·
§7 run: sandbox checkout → row + email; register with the buyer email →
`plan: "lifetime"`; refund in dashboard → `license_refunded`; replay a
delivery → no duplicates. Go-live = real Paddle account + the same three
secrets from the live dashboard, and drop `PADDLE_API_BASE_URL`.

## Trials (Phase 1.5)

No Lemon Squeezy involvement — LS trials only exist for subscriptions. The
trial lives entirely in `/entitlement`:

- First entitlement call with **no license in any status** and no trial row
  starts one: 14 days from that moment, full paid entitlement, `plan: "trial"`
  in the token.
- Token `exp = min(iat + 7 days, trial ends_at)` — a token never outlives the
  trial. Device limit 3 applies identically.
- One trial per account (`trials.user_id` primary key). One per starting
  device: a fingerprint that already started a trial under another account
  gets `403 trial_unavailable` (support path — client shows a contact link).
- Expired → `403 trial_expired`; the client falls back to free tier.
- **License rules always win** (§3a): refunded/revoked → those errors, never
  a trial — so refunding a purchase cannot re-grant one. A purchase mid-trial
  simply takes over (`plan: "lifetime"`); the trial row is left untouched.
- The old `no_license` error is retired — the trial path replaces it.

Config: email confirmations are ON locally (`[auth.email]` in config.toml) so
throwaway signups can't farm trials — mirror in the hosted dashboard
(Auth → Email → "Confirm email").

Client obligations recorded for Phase 3 (not built now): days-remaining
indicator + upgrade CTA while on trial; on `trial_expired` pause scheduled
jobs and notify ("Trial ended — N scheduled workflows paused") — never let
cron jobs die silently; free-tier fallback keeps all workflows/data intact.

## Behavioral notes

- **Auto-claim:** `/entitlement` attaches the oldest unclaimed *active*
  license whose `buyer_email` matches the account email (both normalized).
- **Device limit is 3** active slots, enforced in `/entitlement`. The 4th
  activation returns `409 device_limit` with the active-device list so the
  client can offer deactivation.
- **Deactivation does not invalidate cached tokens** — a revoked device keeps
  working until its entitlement token expires (≤ 7 days). Accepted by design:
  the alternative puts a server check back in the execution path.
- **App tokens are not purchase proof:** the website signs 14-day refresh
  tokens (payload has `exp`, trial users get `plan: 'trial'`) with the *same*
  key as license keys. `/claim-legacy` rejects any payload carrying `exp` or a
  non-`lifetime` plan, so a trial token can't be laundered into a license.
- **Legacy tokens are secrets:** only `sha256(token)` is stored; the raw token
  is never written to the DB or logs.

## Optional: pre-seed legacy licenses

Ed25519 signing is deterministic, so the exact tokens customers hold can be
recomputed from the website's claim records (`lib/claims.ts` exports
`{ email, plan, issuedAt }`). This makes claiming instant and lets email-based
auto-claim work even before the customer runs `/claim-legacy`:

```sh
LICENSE_PRIVATE_KEY=… deno run -A scripts/seed-legacy.ts claims-export.json > seed.sql
psql "$DB_URL" -f seed.sql   # or: supabase db execute --file seed.sql
```

Skipping this is fine — rows are created on first claim.

## Decisions (confirmed by Vali, 2026-07-14)

- **Device limit is 3** (`MAX_ACTIVE_DEVICES` in
  `supabase/functions/entitlement/index.ts`).
- **Admin-granted licenses never get tokens.** If any grants from the website
  admin (`lib/licenseGrants.ts`) need migrating, seed them as unclaimed rows
  with a synthetic `ls_order_id` (e.g. `grant:<email>`) — email auto-claim in
  `/entitlement` attaches them on first sign-in; no token is ever issued.
