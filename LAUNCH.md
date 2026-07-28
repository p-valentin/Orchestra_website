# Go-live checklist

Everything below the line is done. What remains is one decision and one command.

## The switch

Two flags gate the whole thing. Both are currently **unset**, which is why the
live site shows a waitlist form and a closed account area.

```sh
npx vercel env add NEXT_PUBLIC_PAID_ENABLED production      # value: 1
npx vercel env add NEXT_PUBLIC_ACCOUNTS_ENABLED production  # value: 1
npx vercel --prod                                           # REQUIRED — see below
```

**The redeploy is not optional.** `NEXT_PUBLIC_*` variables are inlined into the
browser bundle at *build* time, so changing them in Vercel does nothing to the
already-built site. Setting the flags without rebuilding looks exactly like a
broken switch: the dashboard says `1`, the site still shows the waitlist.

(The server half — `/api/checkout` refusing to mint sessions — reads the same
variable at *runtime*, so that half does flip immediately. Which is worse than
neither flipping, because the two halves would disagree.)

Reversing is the same three commands with the flags removed
(`vercel env rm`), plus a redeploy.

## What each flag does

| Flag | Off (now) | On |
| --- | --- | --- |
| `NEXT_PUBLIC_PAID_ENABLED` | Buy button renders disabled; `/api/checkout` returns 503 | Real checkout, real cards |
| `NEXT_PUBLIC_ACCOUNTS_ENABLED` | `/login`, `/signup`, `/account` all closed | Sign-up, sign-in, trials, self-serve refunds |

`PAID_ENABLED` alone is not enough to sell anything — buying requires a
signed-in account, so `ACCOUNTS_ENABLED` has to be on too. Turning on accounts
alone is a safe intermediate step: people can register and start 14-day trials
without any way to pay.

## First hour after flipping

1. Buy it yourself at full price with a real card. It is the only way to prove
   the live path, and one full-price purchase later refunded looks like an
   ordinary customer changing their mind — unlike a $1 order, which is what
   card-testing looks like.
2. Check `/admin` → **Purchases** shows the order, and **Refunds & reasons** is
   empty.
3. Refund it from `/account` and confirm both emails arrive: the buyer's to
   your own address, the owner alert to `hello@orchestra-automation.com`.
4. Delete the resulting rows so the admin page starts from real business only.

## Already done — do not repeat

- **Polar production org**: account approved, KYC verified, payout account
  connected. Product `d0fe636f…` — Orchestra Lifetime, $149, one-time, no
  benefits (deliberately no Polar licence keys: the account *is* the licence).
- **Webhook endpoint** `63133745…` → `/functions/v1/webhooks-polar`, raw
  format, four events, enabled.
- **Supabase secrets**: `POLAR_WEBHOOK_SECRET`, `POLAR_API_KEY`, `POLAR_ENV=production`,
  `OWNER_EMAIL`, `ADMIN_DATA_SECRET`.
- **Vercel** (production + preview): `POLAR_ACCESS_TOKEN`,
  `NEXT_PUBLIC_POLAR_PRODUCT_ID`, `NEXT_PUBLIC_POLAR_ENV=production`,
  `ADMIN_DATA_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
  `ADMIN_TOTP_SECRET` predates this work.
- **Edge Functions deployed**: `webhooks-polar`, `refund-request`, `admin-data`,
  plus the pre-existing `entitlement`, `devices`, `claim-legacy`.
- **Migrations applied**: `0006_refund_requests`, `0007_tighten_grants`.
- **Proven end to end in production with a real card**: purchase → licence →
  confirmation email → self-serve refund → deactivation → both emails → money
  returned in full.
- **Test data cleared**; the $1 test product is archived.

## Still outstanding

- **Merge `polar-checkout` into `main`.** Merging deploys it, with the flags
  still off, so nothing visible changes — that is the safe rehearsal.
- **Delete `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`, `NEXT_PUBLIC_PADDLE_PRICE_ID`,
  `NEXT_PUBLIC_PADDLE_ENV` from Vercel.** Nothing reads them.
- **Disable the Paddle notification destination** in the Paddle dashboard, then
  delete the `webhooks-paddle` function. Until then two public endpoints can
  write licences; harmless (disjoint order ids) but unnecessary.
- **Rotate the sandbox Polar token** if it still exists — it appeared in a chat
  transcript.
- **Two leftover accounts** in production auth from July testing.

## Numbers worth remembering

- Polar's chargeback ceiling is **0.4%** of sales (card networks': 0.7%).
  The self-serve refund button exists partly to protect this — a buyer who can
  refund in two clicks does not file a dispute.
- Support responses are expected within **48 hours**.
- Customers can file chargebacks up to **120 days** after a transaction.
- Polar's initial account review took effect before launch; **continuous
  reviews** happen at sales thresholds and do not interrupt customers.
