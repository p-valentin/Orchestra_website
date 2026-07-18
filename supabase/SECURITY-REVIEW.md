# Security review — cross-user data isolation

Scope: the Supabase licensing backend (Phase 1–3) — can one signed-in user
read or mutate another user's licenses, devices, or trial? Reviewed 2026-07-17.
Verdict: **no path found.** Every invariant below is covered by an automated
test (`supabase/tests/integration/`), 74/74 green against the local stack.

## The isolation model, and why it holds

Four independent layers each have to fail for a cross-user leak. None do.

**1. The JWT decides identity — clients never supply it.**
Every Edge Function resolves the caller with `supabase.auth.getUser(bearer)`
(`_shared/http.ts`) and scopes *every* query to that `user.id`. No handler
trusts a user id, license id, or device id from the request body to decide
ownership. `config.toml` sets `verify_jwt = true` on `entitlement`, `devices`,
and `claim-legacy`, so unauthenticated calls are rejected at the gateway before
the function runs. → tests: entitlement 9 (401), isolation suite.

**2. RLS scopes every direct table read to `auth.uid()`, and forbids writes.**
`licenses`, `devices`, `trials` each have exactly one policy — `select … using
(user_id = auth.uid())` — and **no** insert/update/delete policy, so the
`authenticated` role can read only its own rows and write none. `webhook_events`
has no policy at all (service-role only). The `authenticated` grant is
`SELECT`-only; `anon` gets nothing. → tests: rls 19–20, trials RLS, isolation
"direct table reads".

**3. Email auto-claim only fires for the caller's OWN confirmed email.**
`entitlement` attaches an unclaimed license when `buyer_email == user.email`.
`user.email` comes from the verified JWT, and production has
`mailer_autoconfirm = false` (verified against the live project) — so a session
on an address *proves control of that inbox*. `mailer_secure_email_change_enabled
= true` closes the change-email variant (the new address must be confirmed too).
A user with a different email calls `entitlement` and falls through to their own
trial; the victim's license stays unclaimed. → test: isolation "license bought
for another email is never auto-claimed".

**4. A legacy token binds to one account, permanently.**
`claim-legacy` intentionally does not require an email match (holding a validly
signed token is the proof of purchase). But once a token's hash is bound to a
user, a different user presenting the same token gets `409 already_claimed` —
no auto-transfer. The atomic `user_id IS NULL` guard on the attach makes
concurrent claims resolve to exactly one winner. → tests: claim-legacy 15,
isolation "legacy token bound to A cannot be re-claimed by B".

## Other checks

- **Device deactivation is not a capability by id.** `devices/deactivate`
  scopes the lookup to the caller; another user's device id is
  indistinguishable from a nonexistent one (404), and the device stays active.
  → tests: devices 12, isolation "cannot deactivate A's device".
- **The `device_limit` 409 listing** only ever contains the caller's own
  devices — no neighbouring user's device metadata leaks into it. → test:
  isolation "entitlement never surfaces another user's devices".
- **`user_id_by_email`** (the webhook's email→account lookup) is
  `SECURITY DEFINER`, `search_path = ''`, execute revoked from
  anon/authenticated, granted to service_role only.
- **Paddle webhook** is public but authenticated by HMAC over the raw body,
  verified before any parse; replay window enforced; idempotent on Paddle's
  `event_id`. → tests: paddle unit suite, webhook integration.
- **Secrets** are never returned or logged: the private signing key stays in
  the function env; `claim-legacy` never logs the raw token; only its sha256
  hash is stored.
- **Website `/account`** reads through the anon client under RLS (own rows
  only) and mutates only via `devices/deactivate` with the caller's JWT.
- **Admin area** (`/admin`) is gated by a signed session cookie behind
  `ADMIN_PASSWORD`, 404s entirely when the password is unset, matches all
  `/admin` paths, and is `noindex`.

## Go-live items (not vulnerabilities — decisions/ops)

- **Two licensing backends coexist in the repo.** The older R2-based
  `/api/license/{login,refresh,register}` (v1.2.0, `lib/accounts.ts` — scrypt
  password hashes on R2) runs alongside the new Supabase backend. Each old
  route resolves a single email's own entitlement, so it is not a cross-user
  risk, but decide at go-live whether the desktop app has fully cut over to the
  Supabase `entitlement` function and retire the R2 routes if so (avoids two
  sources of truth for "who is licensed").
- **Deploy the `devices` function with CORS** before `/account` device removal
  works in prod (see the go-live task; verified locally).
- **Crash-telemetry opt-out** (app side) is still the one disclosed code gap —
  see `Orchestra/docs/COMPLIANCE.md`; the privacy policy discloses it as
  on-by-default with an opt-out planned.
