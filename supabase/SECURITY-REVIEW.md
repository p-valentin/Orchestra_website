# Security review — cross-user data isolation

Scope: the Supabase licensing backend (Phase 1–3) — can one signed-in user
read or mutate another user's licenses, devices, or trial? Reviewed 2026-07-17;
re-reviewed 2026-07-27 for the Paddle → Polar processor swap, and 2026-07-28
for self-serve refunds and the admin commerce views.
Verdict: **no path found.** Every invariant below is covered by an automated
test (`supabase/tests/integration/`), 150/150 green against the local stack.

## The isolation model, and why it holds

Seven independent layers each have to fail for a cross-user leak. None do.

**1. The JWT decides identity — clients never supply it.**
Every Edge Function resolves the caller with `supabase.auth.getUser(bearer)`
(`_shared/http.ts`) and scopes *every* query to that `user.id`. No handler
trusts a user id, license id, or device id from the request body to decide
ownership. `config.toml` sets `verify_jwt = true` on `entitlement`, `devices`,
and `claim-legacy`, so unauthenticated calls are rejected at the gateway before
the function runs. → tests: entitlement 9 (401), isolation suite.

**2. RLS scopes every direct table read to `auth.uid()`, and forbids writes.**
`licenses`, `devices`, `trials`, `refund_requests` each have exactly one
policy — `select … using (user_id = auth.uid())` — and **no**
insert/update/delete policy, so the `authenticated` role can read only its own
rows and write none. `webhook_events` has no policy at all (service-role only).
The `authenticated` grant is `SELECT`-only; `anon` gets nothing. → tests:
rls 19–20, trials RLS, isolation "direct table reads", refund-request 69r.

> **Corrected 2026-07-28.** That last sentence was *aspirational* in
> production, not true: every table in `public` carried
> INSERT/UPDATE/DELETE/TRUNCATE for both `anon` and `authenticated`, because
> Supabase's ALTER DEFAULT PRIVILEGES grants them at table creation and 0001's
> later `grant select` **added to** that set rather than replacing it. Nothing
> was exploitable — RLS was enabled everywhere with only SELECT policies, so
> every write was already denied — but this section claimed two independent
> layers where production had one. `0007_tighten_grants.sql` revokes the
> surplus and makes the second layer real. Any future migration creating a
> table in `public` must end with the same revoke/grant pair.

**3. Email auto-claim only fires for the caller's OWN confirmed email.**
`entitlement` attaches an unclaimed license when `buyer_email == user.email`.
`user.email` comes from the verified JWT, and production has
`mailer_autoconfirm = false` (verified against the live project) — so a session
on an address *proves control of that inbox*. `mailer_secure_email_change_enabled
= true` closes the change-email variant (the new address must be confirmed too).
A user with a different email calls `entitlement` and falls through to their own
trial; the victim's license stays unclaimed. → test: isolation "license bought
for another email is never auto-claimed".

**3b. Purchase attribution comes from the checkout metadata, never the email.**
`webhooks-polar` attaches a license *only* on `data.metadata.user_id`, which
the site sets server-side in `/api/checkout` from a JWT it verified — the
browser never supplies it. The webhook deliberately does **not** call
`user_id_by_email` (the Paddle handler does), so the one buyer-editable field
at checkout — the email — cannot decide whose account gets a license. An order
with absent or unresolvable metadata is recorded *unclaimed* and logged, never
guessed at. Attachment is also one-way: the update is guarded on
`user_id IS NULL`, so a redelivered or resent order carrying a different
`user_id` cannot re-point a license that is already owned. Buy-before-signup
still resolves, but through the reviewed layer 3 path (the buyer's own
confirmed email), not through the webhook. → tests: polar-webhook 43pl/44pl/
45pl, isolation "a Polar order cannot re-point an already-claimed license".

**4. A legacy token binds to one account, permanently.**
`claim-legacy` intentionally does not require an email match (holding a validly
signed token is the proof of purchase). But once a token's hash is bound to a
user, a different user presenting the same token gets `409 already_claimed` —
no auto-transfer. The atomic `user_id IS NULL` guard on the attach makes
concurrent claims resolve to exactly one winner. → tests: claim-legacy 15,
isolation "legacy token bound to A cannot be re-claimed by B".

**5. Money only ever moves for the caller's own licence.**
`refund-request` is the one endpoint that can issue a refund. It takes **no
licence, order or user id from the request body** — it looks up the caller's
own active licence from the JWT, so there is nothing to tamper with. Eligibility
(status, and the 14-day window) is recomputed server-side from stored data; the
button being visible proves nothing. The double-refund guard is a partial
UNIQUE INDEX (`refund_requests_one_open_per_license`), not an if-statement, so
concurrent clicks serialise in the database and the provider is called at most
once. The licence is **not** deactivated here — that stays with the
`order.refunded` webhook, keeping one writer for entitlement state. Provider
error text is never echoed to the browser. → tests: refund-request 60r–69r,
including a 5-way concurrent double-click and the adversarial "B refunds A's
licence" case.

**6. The admin commerce data is not reachable by anyone who finds the URL.**
`admin-data` is public (`verify_jwt = false`) because its caller is the
website's server, which holds no Supabase session. Its defence is a **signed,
60-second request** (`_shared/admin-auth.ts`): HMAC over
`ts.method.path.sha256(body)`, so a captured request is worthless a minute
later, cannot be replayed against another function, and cannot have its body
swapped. Deliberately **no static bearer token exists to leak**. Every failure —
unsigned, mis-signed, stale, wrong view, GET — returns **404**, so a prober
cannot tell the endpoint exists. There is no query language: the caller picks
one of two fixed views with fixed columns and a hard 200-row cap. Buyer emails
are **masked** unless explicitly requested, and account uuids never leave the
function. In production the whole section stays hidden until `ADMIN_TOTP_SECRET`
is set, so customer records are never fronted by a shared password alone; the
admin session was also cut from 7 days to 12 hours. → tests: admin-data 70a–78a.

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
- **Polar webhook** (`webhooks-polar`, the Paddle replacement) is public and
  authenticated the same way: Standard Webhooks HMAC-SHA256 over
  `"<webhook-id>.<webhook-timestamp>.<raw body>"`, verified before any parse,
  ±300 s replay window, all three headers mandatory. Because the id and
  timestamp are *inside* the signed content, a captured delivery cannot be
  replayed under a fresh id to defeat the dedupe key. → tests: polar unit
  suite (12), polar webhook integration (16).
- **Secrets** are never returned or logged: the private signing key stays in
  the function env; `claim-legacy` never logs the raw token; only its sha256
  hash is stored.
- **Website `/account`** reads through the anon client under RLS (own rows
  only) and mutates only via `devices/deactivate` with the caller's JWT.
- **Admin area** (`/admin`) is gated by a signed session cookie behind
  `ADMIN_PASSWORD`, 404s entirely when the password is unset, matches all
  `/admin` paths, and is `noindex`.

## Go-live items (not vulnerabilities — decisions/ops)

- **The website still holds no service-role key.** The admin page reads
  purchases and refunds through the signed `admin-data` call rather than by
  gaining RLS bypass, so the "licensing writes all happen in Edge Functions
  with the service role, which never touches this repo" invariant survives
  the new sections. `ADMIN_DATA_SECRET` grants read of two fixed views, not
  the database.
- **Two payment webhooks coexist during the swap.** `webhooks-paddle` is still
  deployed alongside `webhooks-polar` so the cutover is reversible. Paddle's
  notification destination should be **disabled in the Paddle dashboard** once
  Polar is verified, and the function deleted after that — until then both are
  live writers of `licenses`, which is fine (they key on disjoint order ids)
  but is one more public endpoint than the product needs.
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
