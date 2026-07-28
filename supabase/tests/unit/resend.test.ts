// Unit tests for the transactional email copy (no stack, no network).
//
// These exist because the FIRST version of this email told every buyer to
// "create your account" — including buyers who had just bought while signed in,
// for whom that instruction is both wrong and phishing-shaped. The claimed /
// unclaimed split is the fix, and these tests pin it.

import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import {
  claimEmailHtml,
  claimEmailText,
  refundEmailHtml,
  refundEmailText,
} from '../../functions/_shared/resend.ts'

Deno.test('claimed purchase never tells the buyer to create an account', () => {
  const text = claimEmailText('ORCH-1', { claimed: true })
  const html = claimEmailHtml('ORCH-1', { claimed: true })
  for (const body of [text, html]) {
    assert(!/create your account/i.test(body), 'signed-in buyers already have one')
    assert(!/\/signup/.test(body), 'must not link to sign-up')
  }
  assertStringIncludes(text, 'already attached to this account')
  assertStringIncludes(text, '/downloads')
})

Deno.test('unclaimed purchase DOES carry the claim instructions', () => {
  const text = claimEmailText('ORCH-2', { claimed: false })
  assertStringIncludes(text, '/signup')
  assertStringIncludes(text, 'waiting for an account')
  // Default (no opts) must stay the unclaimed copy — the Paddle handler relies
  // on it and cannot tell whether the licence attached.
  assertStringIncludes(claimEmailText('ORCH-2'), '/signup')
})

Deno.test('no license key ever appears in an email (§4: the account is the license)', () => {
  for (const body of [
    claimEmailText('R', { claimed: true }),
    claimEmailText('R', { claimed: false }),
    claimEmailHtml('R', { claimed: true }),
    refundEmailText('R'),
  ]) {
    assert(!/license key|licence key|activation code/i.test(body))
    assertStringIncludes(body.toLowerCase(), 'orchestra')
  }
})

Deno.test('amount is formatted as currency, and omitted when unknown', () => {
  assertStringIncludes(claimEmailText('R', { claimed: true, amountCents: 14900, currency: 'usd' }), '$149.00')
  // Minor units must not leak raw.
  assert(!claimEmailText('R', { claimed: true, amountCents: 14900, currency: 'usd' }).includes('14900'))
  // Missing/partial pricing info simply drops the line rather than printing NaN.
  for (const opts of [{}, { amountCents: 14900 }, { currency: 'usd' }]) {
    const t = claimEmailText('R', { claimed: true, ...opts })
    assert(!/NaN|undefined|null/.test(t), `leaked placeholder for ${JSON.stringify(opts)}`)
    assert(!/^Paid:/m.test(t))
  }
  // An unknown currency code must not throw.
  assertStringIncludes(claimEmailText('R', { claimed: true, amountCents: 100, currency: 'ZZZ' }), '1.00')
})

Deno.test('merchant of record is named so the card statement is not a surprise', () => {
  assertStringIncludes(claimEmailText('R', { claimed: true }), 'Polar')
  assertStringIncludes(refundEmailText('R'), 'Polar')
  assertStringIncludes(claimEmailText('R', { claimed: true, merchantOfRecord: 'Acme' }), 'Acme')
})

Deno.test('refund email says the licence is deactivated and what the buyer keeps', () => {
  const text = refundEmailText('ORCH-3', { amountCents: 14900, currency: 'usd' })
  assertStringIncludes(text, 'deactivated')
  assertStringIncludes(text, 'yours to keep')
  assertStringIncludes(text, '$149.00')
  assertStringIncludes(refundEmailHtml('ORCH-3'), 'deactivated')
})

Deno.test('a null reference degrades gracefully instead of printing "null"', () => {
  for (const body of [
    claimEmailText(null, { claimed: true }),
    claimEmailHtml(null, { claimed: true }),
    refundEmailText(null),
    refundEmailHtml(null),
  ]) {
    assert(!/null|undefined/.test(body), 'no placeholder leakage')
    assert(!/Order reference/.test(body), 'the row is dropped, not left empty')
  }
})

Deno.test('HTML escapes interpolated values (a reference is provider-controlled)', () => {
  const html = claimEmailHtml('<img src=x onerror=alert(1)>', { claimed: true })
  assert(!html.includes('<img src=x'), 'must not inject raw markup')
  assertStringIncludes(html, '&lt;img')
})

Deno.test('both emails ship a text and an html part with matching intent', () => {
  const t = claimEmailText('R', { claimed: true })
  const h = claimEmailHtml('R', { claimed: true })
  assert(t.length > 100 && h.length > 500)
  assertStringIncludes(h, '<!doctype html>')
  // The plain part must be genuinely plain — no tags leaking into it.
  assert(!/<[a-z]+[ >]/i.test(t), 'text part must not contain markup')
})
