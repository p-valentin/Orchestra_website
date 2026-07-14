// Unit tests for legacy token verification (no Supabase stack needed).
// Covers the pure-logic halves of §8 cases 16 and 17, plus the app-token
// rejection that keeps 14-day refresh tokens from doubling as purchase proof.
//
// Run: deno test -A supabase/tests/unit

import { assert, assertEquals, assertFalse } from 'jsr:@std/assert@1'
import { normalizeEmail, sha256Hex } from '../../functions/_shared/util.ts'
import { verifyLegacyToken } from '../../functions/_shared/legacy.ts'
import { generateLegacyKeypair, signLegacyToken } from '../helpers.ts'

const keys = await generateLegacyKeypair()

Deno.test('valid legacy token verifies; email is normalized', async () => {
  const token = await signLegacyToken(
    { email: '  Vali@Example.COM ', plan: 'lifetime', issuedAt: 1720000000000 },
    keys.privateKey,
  )
  const result = await verifyLegacyToken(token, keys.publicKey)
  assert(result.ok)
  assertEquals(result.claim.email, 'vali@example.com')
  assertEquals(result.claim.issuedAt, 1720000000000)
})

Deno.test('tampered payload fails verification (§8.16)', async () => {
  const token = await signLegacyToken(
    { email: 'a@b.com', plan: 'lifetime', issuedAt: 1720000000000 },
    keys.privateKey,
  )
  const [, sig] = token.split('.')
  const forgedBody = btoa(JSON.stringify({ email: 'evil@b.com', plan: 'lifetime', issuedAt: 1720000000000 }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const result = await verifyLegacyToken(`${forgedBody}.${sig}`, keys.publicKey)
  assertFalse(result.ok)
})

Deno.test('token signed by a different key fails verification', async () => {
  const other = await generateLegacyKeypair()
  const token = await signLegacyToken(
    { email: 'a@b.com', plan: 'lifetime', issuedAt: 1720000000000 },
    other.privateKey,
  )
  const result = await verifyLegacyToken(token, keys.publicKey)
  assertFalse(result.ok)
})

Deno.test('garbage inputs are rejected without crashing (§8.17)', async () => {
  const garbage = [
    '',
    'garbage',
    'a.b.c',
    '..',
    'only-one-part',
    '!!!.###',
    `${btoa('not json').replace(/=+$/, '')}.AAAA`,
    'e30.', // "{}" with empty signature
  ]
  for (const input of garbage) {
    const result = await verifyLegacyToken(input, keys.publicKey)
    assertFalse(result.ok, `should reject: ${JSON.stringify(input)}`)
  }
})

Deno.test('payload missing required fields is rejected', async () => {
  const bads = [
    { plan: 'lifetime', issuedAt: 1 }, // no email
    { email: 'a@b.com', issuedAt: 1 }, // no plan
    { email: 'a@b.com', plan: 'lifetime' }, // no issuedAt
    { email: 42, plan: 'lifetime', issuedAt: 1 }, // wrong type
  ]
  for (const payload of bads) {
    const token = await signLegacyToken(payload as Record<string, unknown>, keys.privateKey)
    const result = await verifyLegacyToken(token, keys.publicKey)
    assertFalse(result.ok, `should reject payload: ${JSON.stringify(payload)}`)
  }
})

Deno.test('app tokens (payload with exp) are rejected — not proof of purchase', async () => {
  // The website's mintAppToken() signs { email, plan, issuedAt, exp } with the
  // SAME key. Those are 14-day refresh tokens (trial users get them too) and
  // must never redeem as a lifetime license.
  const now = Date.now()
  const token = await signLegacyToken(
    { email: 'a@b.com', plan: 'lifetime', issuedAt: now, exp: now + 1209600000 },
    keys.privateKey,
  )
  const result = await verifyLegacyToken(token, keys.publicKey)
  assertFalse(result.ok)
})

Deno.test('non-lifetime plans (e.g. trial) are rejected', async () => {
  const token = await signLegacyToken(
    { email: 'a@b.com', plan: 'trial', issuedAt: Date.now() },
    keys.privateKey,
  )
  const result = await verifyLegacyToken(token, keys.publicKey)
  assertFalse(result.ok)
})

Deno.test('sha256Hex matches a known vector', async () => {
  assertEquals(
    await sha256Hex('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  )
})

Deno.test('normalizeEmail lowercases and trims', () => {
  assertEquals(normalizeEmail('  Foo@BAR.com\t'), 'foo@bar.com')
})
