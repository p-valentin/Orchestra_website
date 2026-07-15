// Drives the license-test MCP server over its real stdio JSON-RPC transport
// and runs the full Phase 1 + 1.5 scenario matrix as MCP tool calls.
//
//   cd supabase && deno run -A mcp/run-matrix.ts
//
// Prereqs: supabase start + functions serve with .env.test (README-phase1).
// Every check below goes through an MCP tool — the same calls Claude Code
// makes when the server is registered via .mcp.json.

import { TextLineStream } from 'jsr:@std/streams@1/text-line-stream'

// ---------- tiny MCP stdio client ----------

const child = new Deno.Command(Deno.execPath(), {
  args: ['run', '-A', 'mcp/server.ts'],
  cwd: new URL('..', import.meta.url).pathname, // supabase/
  stdin: 'piped',
  stdout: 'piped',
  stderr: 'null',
}).spawn()

const writer = child.stdin.getWriter()
const lines = child.stdout
  .pipeThrough(new TextDecoderStream())
  .pipeThrough(new TextLineStream())
  .getReader()

let nextId = 0
async function rpc(method: string, params: unknown): Promise<unknown> {
  const id = ++nextId
  await writer.write(new TextEncoder().encode(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'))
  while (true) {
    const { value, done } = await lines.read()
    if (done) throw new Error('MCP server closed its stdout')
    if (!value?.trim()) continue
    const msg = JSON.parse(value)
    if (msg.id === id) {
      if (msg.error) throw new Error(`rpc ${method} failed: ${JSON.stringify(msg.error)}`)
      return msg.result
    }
  }
}

interface ToolReply {
  isError: boolean
  text: string
  // deno-lint-ignore no-explicit-any
  data: any // parsed JSON when possible
}

async function call(name: string, args: Record<string, unknown> = {}): Promise<ToolReply> {
  const result = (await rpc('tools/call', { name, arguments: args })) as {
    isError?: boolean
    content: Array<{ type: string; text: string }>
  }
  const text = result.content?.[0]?.text ?? ''
  let data: unknown = null
  try {
    data = JSON.parse(text)
  } catch { /* error strings stay in .text */ }
  return { isError: result.isError ?? false, text, data }
}

// ---------- assertion tally ----------

let passed = 0
const failures: string[] = []
function check(cond: boolean, label: string, detail?: unknown) {
  if (cond) {
    passed++
    console.log(`  ok  ${label}`)
  } else {
    failures.push(label)
    console.log(`FAIL  ${label}${detail === undefined ? '' : ` — got: ${JSON.stringify(detail)?.slice(0, 300)}`}`)
  }
}

const DAY_S = 24 * 60 * 60

// ---------- handshake ----------

await rpc('initialize', {
  protocolVersion: '2024-11-05',
  capabilities: {},
  clientInfo: { name: 'run-matrix', version: '1' },
})
await writer.write(new TextEncoder().encode(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n'))

const toolList = (await rpc('tools/list', {})) as { tools: Array<{ name: string }> }
const names = toolList.tools.map((t) => t.name).sort()
console.log(`tools: ${names.join(', ')}\n`)
check(
  ['warp_trial', 'set_license_status', 'seed_trial'].every((t) => names.includes(t)),
  'server exposes the Phase 1.5 tools',
  names,
)

// ---------- A. stack ----------

console.log('\n— stack —')
const status = await call('stack_status')
check(status.data?.configured === true, 'stack_status: configured', status.data)
check(String(status.data?.fn_entitlement).startsWith('reachable'), 'stack_status: entitlement reachable', status.data)

// ---------- B. lifetime license + devices ----------

console.log('\n— lifetime license & device slots —')
const buyer = await call('create_test_user', { email: 'mx-buyer@phase1.test' })
check(!buyer.isError, 'create buyer (adopts pre-restart account if present)', buyer.text)

const seeded = await call('seed_license', { buyer_email: 'MX-Buyer@Phase1.TEST' })
check(seeded.data?.buyer_email === 'mx-buyer@phase1.test' && seeded.data?.user_id === null, 'seed unclaimed license, email normalized', seeded.data)

const ent1 = await call('request_entitlement', { user_email: 'mx-buyer@phase1.test', device_name: 'PC-1', platform: 'windows' })
check(ent1.data?.status === 200 && ent1.data?.jwt?.verified === true, 'entitlement 200 with verified JWT', ent1.data)
check(ent1.data?.jwt?.claims?.plan === 'lifetime', 'auto-claim: plan=lifetime', ent1.data?.jwt?.claims)
check(ent1.data?.jwt?.claims?.exp - ent1.data?.jwt?.claims?.iat === 7 * DAY_S, 'token life exactly 7 days', ent1.data?.jwt?.claims)

const licRows = await call('db_rows', { table: 'licenses', buyer_email: 'mx-buyer@phase1.test' })
check(licRows.data?.[0]?.user_id != null && licRows.data?.[0]?.claimed_at != null, 'license row attached with claimed_at', licRows.data)

const ent1again = await call('request_entitlement', { user_email: 'mx-buyer@phase1.test', device_name: 'PC-1' })
check(ent1again.data?.jwt?.claims?.dev === ent1.data?.jwt?.claims?.dev, 'same device re-request → same device id', ent1again.data?.jwt?.claims)

await call('request_entitlement', { user_email: 'mx-buyer@phase1.test', device_name: 'PC-2' })
await call('request_entitlement', { user_email: 'mx-buyer@phase1.test', device_name: 'PC-3' })
const ent4 = await call('request_entitlement', { user_email: 'mx-buyer@phase1.test', device_name: 'PC-4' })
check(ent4.data?.status === 409 && ent4.data?.body?.error === 'device_limit', '4th device → 409 device_limit', ent4.data?.body)
check(ent4.data?.body?.devices?.length === 3, '409 lists exactly the 3 active devices', ent4.data?.body?.devices)

const victimId = ent4.data.body.devices.find((d: { name: string }) => d.name === 'PC-2')?.id
const deact = await call('deactivate_device', { user_email: 'mx-buyer@phase1.test', device_id: victimId })
check(deact.data?.status === 200, 'deactivate own device → 200', deact.data)
const deact2 = await call('deactivate_device', { user_email: 'mx-buyer@phase1.test', device_id: victimId })
check(deact2.data?.status === 200, 'repeat deactivate → 200 (idempotent)', deact2.data)

const ent4retry = await call('request_entitlement', { user_email: 'mx-buyer@phase1.test', device_name: 'PC-4' })
check(ent4retry.data?.status === 200, 'freed slot → 4th device activates', ent4retry.data?.status)

const reactivate = await call('request_entitlement', { user_email: 'mx-buyer@phase1.test', device_name: 'PC-2' })
check(reactivate.data?.status === 409, 'revoked device cannot reactivate into a full house', reactivate.data?.status)

const list = await call('list_devices', { user_email: 'mx-buyer@phase1.test' })
const listNames = (list.data?.body?.devices ?? []).map((d: { name: string }) => d.name).sort()
check(JSON.stringify(listNames) === JSON.stringify(['PC-1', 'PC-2', 'PC-3', 'PC-4']), 'list shows all devices incl. revoked', listNames)

const intruder = await call('create_test_user', { email: 'mx-intruder@phase1.test' })
check(!intruder.isError, 'create intruder', intruder.text)
const crossDeact = await call('deactivate_device', { user_email: 'mx-intruder@phase1.test', device_id: victimId })
check(crossDeact.data?.status === 404, 'deactivating another user’s device → 404', crossDeact.data)

const badFp = await call('request_entitlement', { user_email: 'mx-buyer@phase1.test', device_name: 'Bad', fingerprint: 'nope' })
check(badFp.data?.status === 400 && badFp.data?.body?.error === 'invalid_request', 'malformed fingerprint → 400', badFp.data?.body)

// ---------- C. license statuses ----------

console.log('\n— refunded / revoked —')
const revoked = await call('set_license_status', { buyer_email: 'mx-buyer@phase1.test', status: 'revoked' })
check(revoked.data?.[0]?.status === 'revoked', 'set_license_status → revoked', revoked.data)
const entRevoked = await call('request_entitlement', { user_email: 'mx-buyer@phase1.test', device_name: 'PC-1' })
check(entRevoked.data?.status === 403 && entRevoked.data?.body?.error === 'license_revoked', 'revoked license → 403 license_revoked', entRevoked.data?.body)

await call('set_license_status', { buyer_email: 'mx-buyer@phase1.test', status: 'refunded' })
const entRefunded = await call('request_entitlement', { user_email: 'mx-buyer@phase1.test', device_name: 'PC-1' })
check(entRefunded.data?.body?.error === 'license_refunded', 'refunded license → 403 license_refunded', entRefunded.data?.body)
const buyerTrials = await call('db_rows', { table: 'trials', user_email: 'mx-buyer@phase1.test' })
check(Array.isArray(buyerTrials.data) && buyerTrials.data.length === 0, 'refunded purchase grants NO trial', buyerTrials.data)

// ---------- D. legacy claims ----------

console.log('\n— legacy claims —')
const legacyUser = await call('create_test_user', { email: 'mx-legacy@phase1.test' })
check(!legacyUser.isError, 'create legacy claimant', legacyUser.text)

const minted = await call('mint_legacy_token', { email: '  Old.Buyer@GMAIL.com ', issued_at_ms: 1751500000000 })
const legacyToken = minted.data?.legacy_token
check(typeof legacyToken === 'string' && legacyToken.includes('.'), 'mint legacy token', minted.data)

const claim = await call('claim_legacy', { user_email: 'mx-legacy@phase1.test', legacy_token: legacyToken })
check(claim.data?.status === 200, 'valid claim → 200', claim.data)

const legacyRow = await call('db_rows', { table: 'licenses', buyer_email: 'old.buyer@gmail.com' })
check(legacyRow.data?.[0]?.legacy_token_hash === minted.data?.sha256, 'DB stores sha256 hash only', legacyRow.data)
check(!JSON.stringify(legacyRow.data).includes(legacyToken), 'raw token nowhere in the row', undefined)
check(new Date(legacyRow.data?.[0]?.purchased_at).getTime() === 1751500000000, 'purchased_at = token issuedAt', legacyRow.data?.[0]?.purchased_at)

const reclaim = await call('claim_legacy', { user_email: 'mx-legacy@phase1.test', legacy_token: legacyToken })
check(reclaim.data?.status === 200, 're-claim by owner → 200 (idempotent)', reclaim.data)
const rowsAfter = await call('db_rows', { table: 'licenses', buyer_email: 'old.buyer@gmail.com' })
check(rowsAfter.data?.length === 1, 'still exactly one license row', rowsAfter.data?.length)

const steal = await call('claim_legacy', { user_email: 'mx-intruder@phase1.test', legacy_token: legacyToken })
check(steal.data?.status === 409 && steal.data?.body?.error === 'already_claimed', 'steal attempt → 409', steal.data?.body)

for (const [label, args] of [
  ['tampered token → 400', { email: 'old.buyer@gmail.com', tamper: true }],
  ['app token (exp) → 400', { email: 'old.buyer@gmail.com', include_exp: true }],
  ['trial-plan token → 400', { email: 'old.buyer@gmail.com', plan: 'trial' }],
] as const) {
  const bad = await call('mint_legacy_token', args as Record<string, unknown>)
  const res = await call('claim_legacy', { user_email: 'mx-intruder@phase1.test', legacy_token: bad.data?.legacy_token })
  check(res.data?.status === 400 && res.data?.body?.error === 'invalid_token', label, res.data?.body)
}
const garbage = await call('claim_legacy', { user_email: 'mx-intruder@phase1.test', legacy_token: 'total-garbage' })
check(garbage.data?.status === 400, 'garbage token → 400', garbage.data?.body)

// ---------- E. trials ----------

console.log('\n— trials —')
const trialUser = await call('create_test_user', { email: 'mx-trial@phase1.test' })
check(!trialUser.isError, 'create trial user', trialUser.text)

const trialEnt = await call('request_entitlement', { user_email: 'mx-trial@phase1.test', device_name: 'Trial-PC' })
check(trialEnt.data?.status === 200 && trialEnt.data?.jwt?.claims?.plan === 'trial', 'first call, no license → plan=trial', trialEnt.data?.jwt?.claims)
check(trialEnt.data?.jwt?.claims?.exp - trialEnt.data?.jwt?.claims?.iat === 7 * DAY_S, 'fresh trial token: 7-day cap binds', trialEnt.data?.jwt?.claims)

const trialRows = await call('db_rows', { table: 'trials', user_email: 'mx-trial@phase1.test' })
const trialRow = trialRows.data?.[0]
check(trialRow?.starting_fingerprint === trialEnt.data?.fingerprint, 'trial row records starting fingerprint', trialRow)
check(
  Math.abs((Date.parse(trialRow?.ends_at) - Date.parse(trialRow?.started_at)) / 1000 - 14 * DAY_S) < 5,
  'trial lasts 14 days',
  trialRow,
)

const warped = await call('warp_trial', { user_email: 'mx-trial@phase1.test', days_in: 13 })
check(!warped.isError, 'warp trial to 13 days in', warped.text)
const capped = await call('request_entitlement', { user_email: 'mx-trial@phase1.test', device_name: 'Trial-PC' })
check(
  capped.data?.jwt?.claims?.exp === Math.floor(Date.parse(warped.data?.ends_at) / 1000),
  'day-13 token exp equals trial ends_at (cap beats 7d)',
  { exp: capped.data?.jwt?.claims?.exp, ends_at: warped.data?.ends_at },
)

await call('warp_trial', { user_email: 'mx-trial@phase1.test', days_in: 15 })
const expired = await call('request_entitlement', { user_email: 'mx-trial@phase1.test', device_name: 'Trial-PC' })
check(expired.data?.status === 403 && expired.data?.body?.error === 'trial_expired', 'expired trial → 403 trial_expired', expired.data?.body)

// Fingerprint soft block: a fresh account on the SAME machine gets no trial.
const thief = await call('create_test_user', { email: 'mx-trial-thief@phase1.test' })
check(!thief.isError, 'create second account for fingerprint block', thief.text)
const blocked = await call('request_entitlement', {
  user_email: 'mx-trial-thief@phase1.test',
  device_name: 'Same-Machine',
  fingerprint: trialEnt.data?.fingerprint,
})
check(blocked.data?.status === 403 && blocked.data?.body?.error === 'trial_unavailable', 'same fingerprint, new account → 403 trial_unavailable', blocked.data?.body)
const thiefTrials = await call('db_rows', { table: 'trials', user_email: 'mx-trial-thief@phase1.test' })
check(thiefTrials.data?.length === 0, 'no trial row created for the blocked account', thiefTrials.data)

// Purchase supersedes an active trial; the trial row stays untouched.
await call('warp_trial', { user_email: 'mx-trial@phase1.test', days_in: 5 })
const purchase = await call('seed_license', { buyer_email: 'mx-trial@phase1.test', claim_for_user_email: 'mx-trial@phase1.test' })
check(!purchase.isError, 'purchase lands mid-trial', purchase.text)
const upgraded = await call('request_entitlement', { user_email: 'mx-trial@phase1.test', device_name: 'Trial-PC' })
check(upgraded.data?.jwt?.claims?.plan === 'lifetime', 'purchase supersedes trial → plan=lifetime', upgraded.data?.jwt?.claims)
check(upgraded.data?.jwt?.claims?.exp - upgraded.data?.jwt?.claims?.iat === 7 * DAY_S, 'lifetime token uncapped again', upgraded.data?.jwt?.claims)
const trialAfter = await call('db_rows', { table: 'trials', user_email: 'mx-trial@phase1.test' })
check(trialAfter.data?.length === 1, 'trial row untouched by the purchase', trialAfter.data)

// Refund after purchase: license rules win over the (active) trial.
await call('set_license_status', { buyer_email: 'mx-trial@phase1.test', status: 'refunded' })
const refundWins = await call('request_entitlement', { user_email: 'mx-trial@phase1.test', device_name: 'Trial-PC' })
check(refundWins.data?.body?.error === 'license_refunded', 'refund → 403 license_refunded, never falls back to trial', refundWins.data?.body)

// ---------- F. cleanup ----------

console.log('\n— cleanup —')
const cleaned = await call('cleanup_test_data')
check(!cleaned.isError, `cleanup: ${cleaned.text.replace(/\s+/g, ' ').slice(0, 80)}`, cleaned.text)
for (const table of ['licenses', 'devices', 'trials'] as const) {
  const rows = await call('db_rows', { table })
  check(rows.data?.length === 0, `${table} empty after cleanup`, rows.data)
}

// ---------- verdict ----------

console.log(`\n${failures.length === 0 ? 'ALL CHECKS PASSED' : 'FAILURES'}: ${passed} passed, ${failures.length} failed`)
if (failures.length) for (const f of failures) console.log(`  - ${f}`)

await writer.close()
child.kill()
Deno.exit(failures.length === 0 ? 0 : 1)
