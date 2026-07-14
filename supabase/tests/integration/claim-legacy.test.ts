// §8 cases 13–18: POST /claim-legacy.
// Legacy tokens are minted here with the private key that pairs with the
// LEGACY_SIGNING_KEY the functions were served with (see scripts/setup-test-env.ts).

import { assertEquals, assertExists, assertNotEquals } from 'jsr:@std/assert@1'
import {
  adminClient,
  callFn,
  createTestUser,
  deleteTestUser,
  importLegacyPrivateKeyPkcs8B64,
  loadTestKeys,
  requireStack,
  SUPABASE_URL,
  sha256HexOf,
  signLegacyToken,
  uniqueEmail,
} from '../helpers.ts'

requireStack()
const admin = adminClient()
const testKeys = await loadTestKeys()
const legacyKey = await importLegacyPrivateKeyPkcs8B64(testKeys.legacyPrivateKeyPkcs8B64)

function legacyPayload(email: string) {
  return { email, plan: 'lifetime', issuedAt: 1719999999999 }
}

async function deleteLicenseByHash(hash: string) {
  await admin.from('licenses').delete().eq('legacy_token_hash', hash)
}

Deno.test('13. valid unclaimed token → license row created and attached', async () => {
  const user = await createTestUser(uniqueEmail('leg13'))
  // Mixed case + padding on purpose: buyer_email must be stored normalized.
  const token = await signLegacyToken(legacyPayload('  Buyer13@Example.COM '), legacyKey)
  const hash = await sha256HexOf(token)
  try {
    const res = await callFn('claim-legacy', { token: user.accessToken, body: { legacy_token: token } })
    assertEquals(res.status, 200)
    assertEquals(res.body.ok, true)

    const { data: lic } = await admin.from('licenses').select('*').eq('legacy_token_hash', hash).single()
    assertExists(lic)
    assertEquals(lic!.buyer_email, 'buyer13@example.com')
    assertEquals(lic!.user_id, user.id)
    assertEquals(lic!.plan, 'lifetime')
    assertEquals(lic!.status, 'active')
    assertExists(lic!.claimed_at)
    assertEquals(new Date(lic!.purchased_at).getTime(), 1719999999999)
  } finally {
    await deleteLicenseByHash(hash)
    await deleteTestUser(user.id)
  }
})

Deno.test('14. same user claims same token twice → 200, exactly one license row', async () => {
  const user = await createTestUser(uniqueEmail('leg14'))
  const token = await signLegacyToken(legacyPayload('buyer14@example.com'), legacyKey)
  const hash = await sha256HexOf(token)
  try {
    const first = await callFn('claim-legacy', { token: user.accessToken, body: { legacy_token: token } })
    assertEquals(first.status, 200)
    const second = await callFn('claim-legacy', { token: user.accessToken, body: { legacy_token: token } })
    assertEquals(second.status, 200)
    assertEquals(second.body.ok, true)

    const { data: rows } = await admin.from('licenses').select('id').eq('legacy_token_hash', hash)
    assertEquals(rows!.length, 1)
  } finally {
    await deleteLicenseByHash(hash)
    await deleteTestUser(user.id)
  }
})

Deno.test('15. token already claimed by a different user → 409 already_claimed', async () => {
  const first = await createTestUser(uniqueEmail('leg15a'))
  const second = await createTestUser(uniqueEmail('leg15b'))
  const token = await signLegacyToken(legacyPayload('buyer15@example.com'), legacyKey)
  const hash = await sha256HexOf(token)
  try {
    const claim = await callFn('claim-legacy', { token: first.accessToken, body: { legacy_token: token } })
    assertEquals(claim.status, 200)

    const res = await callFn('claim-legacy', { token: second.accessToken, body: { legacy_token: token } })
    assertEquals(res.status, 409)
    assertEquals(res.body.error, 'already_claimed')

    // Still owned by the first claimer — no auto-transfer.
    const { data: lic } = await admin.from('licenses').select('user_id').eq('legacy_token_hash', hash).single()
    assertEquals(lic!.user_id, first.id)
  } finally {
    await deleteLicenseByHash(hash)
    await deleteTestUser(first.id)
    await deleteTestUser(second.id)
  }
})

Deno.test('16. tampered payload → 400 invalid_token, nothing stored', async () => {
  const user = await createTestUser(uniqueEmail('leg16'))
  const token = await signLegacyToken(legacyPayload('buyer16@example.com'), legacyKey)
  const [, sig] = token.split('.')
  const forgedBody = btoa(JSON.stringify(legacyPayload('evil16@example.com')))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const forged = `${forgedBody}.${sig}`
  try {
    const res = await callFn('claim-legacy', { token: user.accessToken, body: { legacy_token: forged } })
    assertEquals(res.status, 400)
    assertEquals(res.body.error, 'invalid_token')

    const { data: rows } = await admin
      .from('licenses').select('id').in('buyer_email', ['buyer16@example.com', 'evil16@example.com'])
    assertEquals(rows!.length, 0)
  } finally {
    await deleteTestUser(user.id)
  }
})

Deno.test('17. garbage input / wrong structure → 400, no crash', async () => {
  const user = await createTestUser(uniqueEmail('leg17'))
  try {
    const garbageBodies = [
      { legacy_token: 'garbage' },
      { legacy_token: '' },
      { legacy_token: 'a.b.c' },
      { legacy_token: 42 },
      {},
      { wrong_field: 'x' },
    ]
    for (const body of garbageBodies) {
      const res = await callFn('claim-legacy', { token: user.accessToken, body })
      assertEquals(res.status, 400, `should 400 for body: ${JSON.stringify(body)}`)
    }

    // Raw non-JSON body must not crash the function either.
    const raw = await fetch(`${SUPABASE_URL}/functions/v1/claim-legacy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.accessToken}` },
      body: 'this is not json',
    })
    await raw.text()
    assertEquals(raw.status, 400)
  } finally {
    await deleteTestUser(user.id)
  }
})

Deno.test('18. raw token never stored — only its sha256 hash appears in the DB', async () => {
  const user = await createTestUser(uniqueEmail('leg18'))
  const token = await signLegacyToken(legacyPayload('buyer18@example.com'), legacyKey)
  const hash = await sha256HexOf(token)
  try {
    const res = await callFn('claim-legacy', { token: user.accessToken, body: { legacy_token: token } })
    assertEquals(res.status, 200)

    const { data: lic } = await admin.from('licenses').select('*').eq('legacy_token_hash', hash).single()
    assertExists(lic)
    assertEquals(lic!.legacy_token_hash, hash)
    assertNotEquals(lic!.legacy_token_hash, token)
    // No column of the row contains the raw token (or even its payload half).
    const serialized = JSON.stringify(lic)
    assertEquals(serialized.includes(token), false)
    assertEquals(serialized.includes(token.split('.')[0]), false)
  } finally {
    await deleteLicenseByHash(hash)
    await deleteTestUser(user.id)
  }
})
