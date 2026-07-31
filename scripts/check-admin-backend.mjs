// Does this machine's Node process reach the admin-data Edge Function?
//
// Exists because /admin can only report "couldn't reach the licensing backend"
// — it cannot tell you whether that is the secret, the network, DNS, a proxy,
// or the function itself. This makes the same call the website makes, with the
// same signing, and prints what actually happened.
//
//   node scripts/check-admin-backend.mjs
//
// Run it from the SAME shell that runs `npm run dev`: the whole point is to
// capture that shell's environment, which is where a difference would live.

import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'

const envPath = path.join(process.cwd(), '.env.local')
if (!fs.existsSync(envPath)) {
  console.error('No .env.local here — run this from the project root.')
  process.exit(1)
}

const env = Object.fromEntries(
  fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => /^[A-Z_]+=/.test(l))
    .map(l => {
      const i = l.indexOf('=')
      return [l.slice(0, i), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')]
    }),
)

const secret = process.env.ADMIN_DATA_SECRET || env.ADMIN_DATA_SECRET
const base = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL

console.log('environment')
console.log('  node                 :', process.version)
console.log('  ADMIN_DATA_SECRET    :', secret ? `${secret.length} chars` : 'MISSING')
console.log('  NEXT_PUBLIC_SUPABASE_URL:', base ?? 'MISSING')
const proxies = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'NO_PROXY', 'NODE_USE_ENV_PROXY']
  .filter(k => process.env[k])
console.log('  proxy vars           :', proxies.length ? proxies.map(k => `${k}=${process.env[k]}`).join(' ') : 'none')

if (!secret || !base) process.exit(1)

for (const view of ['metrics', 'purchases', 'mail-unread', 'threads']) {
  const body = JSON.stringify({ view, limit: 50, reveal: false })
  const ts = Math.floor(Date.now() / 1000)
  const bodyHash = crypto.createHash('sha256').update(body).digest('hex')
  const sig = crypto.createHmac('sha256', secret)
    .update(`${ts}.POST./admin-data.${bodyHash}`).digest('base64')
  const started = Date.now()
  try {
    const res = await fetch(`${base}/functions/v1/admin-data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-orchestra-ts': String(ts),
        'x-orchestra-sig': `v1,${sig}`,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    })
    const text = await res.text()
    const ms = Date.now() - started
    const verdict = res.status === 200 ? 'OK' : res.status === 404 ? 'REJECTED (signature or unknown view)' : 'unexpected'
    console.log(`  ${view.padEnd(12)} ${String(res.status).padEnd(4)} ${String(ms + 'ms').padEnd(8)} ${verdict}  ${text.slice(0, 50)}`)
  } catch (err) {
    console.log(`  ${view.padEnd(12)} FAIL          ${Date.now() - started}ms  ${err instanceof Error ? err.message : err}`)
  }
}
