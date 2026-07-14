# Orchestra licensing — Phase 1 backend

Supabase backend for the $129 lifetime license: schema + RLS, entitlement
issuance, device management, and legacy license migration. Desktop
integration is Phase 3; Lemon Squeezy webhooks are Phase 2 (only the
`webhook_events` table exists so far).

## Layout

```
supabase/
  migrations/0001_licensing.sql     schema + RLS (licenses, devices, webhook_events)
  functions/
    _shared/                        token signing, legacy verification, http plumbing
    entitlement/                    POST /entitlement — issue 7-day EdDSA JWT
    devices/                        GET /devices, POST /devices/deactivate
    claim-legacy/                   POST /claim-legacy — redeem old-format license keys
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

Example flow: `setup_test_keys` → serve functions with `.env.test` →
`create_test_user` → `seed_license` (unclaimed, same email) →
`request_entitlement` (watch auto-claim + verified JWT) → repeat with new
`device_name`s until `409 device_limit` → `deactivate_device` → retry →
`cleanup_test_data`.

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

## Open items (carried from the brief)

- Device limit 3: implemented per the brief (`MAX_ACTIVE_DEVICES` in
  `supabase/functions/entitlement/index.ts`) — flag if it should differ.
- Customers granted licenses through the website admin (`lib/licenseGrants.ts`)
  have **no token**. If any exist at migration time, seed them as unclaimed
  rows so email auto-claim picks them up — note the schema requires an origin,
  so give them a synthetic `ls_order_id` like `grant:<email>` or use
  `seed-legacy.ts` (their deterministic token hash is computable even though
  no token was ever delivered).
