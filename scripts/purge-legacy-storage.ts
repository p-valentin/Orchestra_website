// Deletes the R2 objects left behind by the pre-Supabase licensing stack.
//
// WHAT THIS REMOVES, and why it is safe:
//
//   site/accounts/*        scrypt password hashes for a sign-in system that no
//                          longer exists. /api/license/{register,login,refresh}
//                          are gone; Orchestra 1.3.0 authenticates against
//                          Supabase Auth and has never called them.
//   site/licenses/*        the old per-email grant records, superseded by the
//   site/licenses.json     `licenses` table in Supabase, fed by Polar webhooks.
//   site/claims/*          free-window claim records. The claim endpoint is
//   site/claims-index.json retired and the window is closed.
//
// Legacy license KEYS are NOT affected. They are Ed25519 tokens verified by the
// claim-legacy Edge Function against LEGACY_SIGNING_KEY inside Supabase, which
// never read any of these objects. Anyone holding one can still redeem it.
// scripts/seed-legacy.ts can still reproduce a specific customer's token from
// LICENSE_PRIVATE_KEY if you ever need to re-send one — but note that it takes
// a claims export as input, so EXPORT FIRST if you think you might want that.
//
// This is irreversible. It runs in two steps on purpose:
//
//   npx tsx scripts/purge-legacy-storage.ts            # dry run: lists only
//   npx tsx scripts/purge-legacy-storage.ts --confirm  # actually deletes
//
// Requires R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY —
// the same four the site uses. Without them it refuses rather than silently
// operating on the local .data/ directory, which would look like it worked.

import { deleteKey, listKeys, readJson, storageMode } from '../lib/store'

const PREFIXES = ['site/accounts/', 'site/licenses/', 'site/claims/']
const SINGLE_KEYS = ['site/licenses.json', 'site/claims-index.json']

async function main(): Promise<void> {
  const confirm = process.argv.includes('--confirm')

  if (storageMode() !== 'r2') {
    console.error('Refusing to run: R2 is not configured, so this would only touch .data/ on this machine.')
    console.error('Set R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY first.')
    process.exit(1)
  }

  const found: string[] = []
  for (const prefix of PREFIXES) {
    const keys = await listKeys(prefix)
    found.push(...keys)
  }
  for (const key of SINGLE_KEYS) {
    // readJson returns the fallback for a missing key, so a sentinel tells the
    // two cases apart — deleting a key that was never there is noise in the log.
    const value = await readJson<unknown>(key, null)
    if (value !== null) found.push(key)
  }

  if (found.length === 0) {
    console.log('Nothing to remove — the legacy keys are already gone.')
    return
  }

  console.log(`${found.length} object(s) under the legacy prefixes:\n`)
  for (const key of found) console.log(`  ${key}`)

  if (!confirm) {
    console.log('\nDry run. Nothing was deleted.')
    console.log('If this list looks right, re-run with --confirm.')
    console.log('Consider saving a copy first: these are the only records of who claimed a free licence.')
    return
  }

  console.log('\nDeleting…')
  let removed = 0
  let failed = 0
  for (const key of found) {
    const ok = await deleteKey(key)
    if (ok) {
      removed += 1
    } else {
      failed += 1
      console.error(`  FAILED: ${key}`)
    }
  }
  console.log(`\nRemoved ${removed} object(s)${failed > 0 ? `, ${failed} failed` : ''}.`)
  if (failed > 0) process.exit(1)
}

main().catch((err: unknown) => {
  console.error('purge failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
