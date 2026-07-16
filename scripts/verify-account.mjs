// Do login, the account page, and the auth-aware nav actually work?
//
// Against the LOCAL stack (full coverage, including device removal):
//   supabase start && supabase functions serve --env-file supabase/functions/.env.test
//   scratchpad/start-local-dev.sh                        # dev server on :3100 → local Supabase
//   eval "$(supabase status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
//   SITE_URL=http://localhost:3100 node scripts/verify-account.mjs
//
// Against PROD Supabase (default dev server on :3000):
//   SUPABASE_ACCESS_TOKEN=… SKIP_DEACTIVATE=1 node scripts/verify-account.mjs
//   (SKIP_DEACTIVATE until the devices function with CORS is deployed there)
//
// Walks the whole thing in a real browser: bad login → good login → fresh
// account state → seeded license/devices → removing a device → sign out.
// Creates a temporary account and cleans everything up afterwards.

import { chromium } from '../../Orchestra/node_modules/playwright/index.mjs'
import { createClient } from '@supabase/supabase-js'

const SITE = process.env.SITE_URL ?? 'http://localhost:3000'
const SKIP_DEACTIVATE = !!process.env.SKIP_DEACTIVATE
const INBOX = process.env.TEST_INBOX ?? 'valivali10298@gmail.com'
const [box, domain] = INBOX.split('@')
const EMAIL = `${box}+acct${Date.now().toString().slice(-6)}@${domain}`
const PASSWORD = 'orchestra-account-test-123'

// Local mode: API_URL/SERVICE_ROLE_KEY from `supabase status -o env`.
// Prod mode: management API via SUPABASE_ACCESS_TOKEN, like the other verify scripts.
let supabaseUrl = process.env.API_URL ?? process.env.SUPABASE_URL
let serviceKey = process.env.SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceKey) {
  const REF = process.env.SUPABASE_PROJECT_REF ?? 'jxcxtwmqwontjttywxlt'
  const SB = process.env.SUPABASE_ACCESS_TOKEN
  if (!SB) throw new Error('Need API_URL+SERVICE_ROLE_KEY (local) or SUPABASE_ACCESS_TOKEN (prod)')
  const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, {
    headers: { Authorization: `Bearer ${SB}` },
  })).json()
  supabaseUrl = `https://${REF}.supabase.co`
  serviceKey = keys.find((k) => k.name === 'service_role').api_key
}
const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

let pass = 0
const fails = []
const check = (cond, label, detail) => {
  if (cond) { pass++; console.log(`  ok  ${label}`) }
  else { fails.push(label); console.log(`FAIL  ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 200)}`}`) }
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const consoleErrors = []
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
page.on('pageerror', (e) => consoleErrors.push(String(e)))
page.on('dialog', (d) => d.accept()) // the Remove confirm()

let userId = null
const licenseIds = []
try {
  const { data: created, error } = await admin.auth.admin.createUser({
    email: EMAIL, password: PASSWORD, email_confirm: true,
  })
  if (error) throw new Error(`createUser: ${error.message}`)
  userId = created.user.id

  // 1. Signed out, /account bounces to /login.
  await page.goto(`${SITE}/account`, { waitUntil: 'networkidle' })
  await page.waitForURL('**/login', { timeout: 10_000 }).catch(() => {})
  check(page.url().includes('/login'), 'signed out: /account redirects to /login')

  // 2. Nav shows Log in + Sign up while signed out.
  await page.goto(`${SITE}/`, { waitUntil: 'networkidle' })
  check((await page.locator('header a[href="/login"]').count()) > 0, 'nav shows Log in when signed out')
  check((await page.locator('header a[href="/signup"]').count()) > 0, 'nav shows Sign up when signed out')
  check((await page.locator('header a[href="/account"]').count()) === 0, 'nav hides Account when signed out')

  // 3. Wrong password gets a human error, not a redirect.
  await page.goto(`${SITE}/login`, { waitUntil: 'networkidle' })
  check((await page.locator('h1').innerText()) === 'Sign in', 'login page renders')
  await page.fill('input[name="email"]', EMAIL)
  await page.fill('input[name="password"]', 'not-the-password')
  await page.click('button[type="submit"]')
  await page.waitForSelector('form p[role="alert"]', { timeout: 20_000 })
  check(/wrong email or password/i.test(await page.locator('form p[role="alert"]').innerText()),
    'wrong password → friendly error', await page.locator('form p[role="alert"]').innerText())

  // 4. Correct login lands on /account.
  await page.fill('input[name="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/account', { timeout: 20_000 })
  check(page.url().includes('/account'), 'correct login lands on /account')

  // 5. Fresh account: no license, trial not started, no devices.
  await page.waitForSelector('h1', { timeout: 10_000 })
  const freshBody = await page.locator('main').innerText()
  check(freshBody.includes(EMAIL), 'shows the signed-in email')
  check(/no license yet/i.test(freshBody), 'fresh account: "No license yet"')
  check(/not started/i.test(freshBody), 'fresh account: trial "Not started"')
  check(/0 of 3 slots/i.test(freshBody), 'fresh account: 0 of 3 device slots')

  // 6. Nav now shows Account, not Log in.
  check((await page.locator('header a[href="/account"]').count()) > 0, 'nav shows Account when signed in')
  check((await page.locator('header a[href="/login"]').count()) === 0, 'nav hides Log in when signed in')

  // 7. Seed a purchase, a trial, and two devices, then reload.
  const { data: lic, error: licErr } = await admin.from('licenses').insert({
    user_id: userId, buyer_email: EMAIL, order_id: `e2e-${Date.now()}`,
    status: 'active', plan: 'lifetime', claimed_at: new Date().toISOString(),
  }).select('id').single()
  check(!licErr, 'seeded license row', licErr?.message)
  if (lic) licenseIds.push(lic.id)
  const { error: devErr } = await admin.from('devices').insert([
    { user_id: userId, fingerprint_hash: 'e'.repeat(64), name: 'Work MacBook', platform: 'macos', app_version: '1.4.0' },
    { user_id: userId, fingerprint_hash: 'f'.repeat(64), name: 'Home PC', platform: 'windows', app_version: '1.4.0' },
  ])
  check(!devErr, 'seeded device rows', devErr?.message)
  await admin.from('trials').insert({
    user_id: userId, ends_at: new Date(Date.now() + 5 * 86_400_000).toISOString(), starting_fingerprint: 'e'.repeat(64),
  })

  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('h1', { timeout: 10_000 })
  const paidBody = await page.locator('main').innerText()
  check(/lifetime license — active/i.test(paidBody), 'license shows as active lifetime')
  check(!/trial/i.test(paidBody.split('Devices')[0].replace(/.*license/is, '')) || !/days left/i.test(paidBody),
    'trial section hidden once licensed')
  check(/2 of 3 slots/i.test(paidBody), 'shows 2 of 3 device slots')
  check(paidBody.includes('Work MacBook') && paidBody.includes('Home PC'), 'device names listed')
  check(/macOS/.test(paidBody) && /Windows/.test(paidBody), 'platforms are labelled')

  // 8. Remove a device (confirm() auto-accepted above).
  if (SKIP_DEACTIVATE) {
    console.log('  --  device removal skipped (SKIP_DEACTIVATE)')
  } else {
    const row = page.locator('li', { hasText: 'Home PC' })
    await row.locator('button', { hasText: 'Remove' }).click()
    await page.waitForFunction(() => !document.body.innerText.includes('Home PC'), { timeout: 20_000 })
    check(true, 'removed device disappears from the list')
    check(/1 of 3 slots/i.test(await page.locator('main').innerText()), 'slot count drops to 1 of 3')
    const { data: revoked } = await admin.from('devices')
      .select('revoked_at').eq('user_id', userId).eq('name', 'Home PC').single()
    check(!!revoked?.revoked_at, 'revoked_at is set in the database', revoked)
  }

  // 9. Sign out: back to the landing page, nav flips back, /account bounces.
  await page.click('button:has-text("Sign out")')
  await page.waitForURL(`${SITE}/`, { timeout: 20_000 })
  check((await page.locator('header a[href="/login"]').count()) > 0, 'after sign-out the nav shows Log in again')
  await page.goto(`${SITE}/account`, { waitUntil: 'networkidle' })
  await page.waitForURL('**/login', { timeout: 10_000 }).catch(() => {})
  check(page.url().includes('/login'), 'after sign-out /account redirects to /login')

  const realErrors = consoleErrors.filter((e) =>
    !/eval\(\) is not supported/.test(e) && !/va\.vercel-scripts\.com/.test(e) &&
    !/401|400/.test(e)) // supabase auth probes for wrong-password are expected
  check(realErrors.length === 0, 'no console errors that would exist in production', realErrors.slice(0, 2))
} finally {
  await browser.close()
  for (const id of licenseIds) await admin.from('licenses').delete().eq('id', id)
  if (userId) await admin.auth.admin.deleteUser(userId) // devices + trials cascade
  console.log('\ncleanup: removed the test account, its license row, devices, and trial')
}

console.log(`\n${fails.length === 0 ? 'ACCOUNT AREA WORKS' : 'FAILURES'}: ${pass} passed, ${fails.length} failed`)
for (const f of fails) console.log(`  - ${f}`)
process.exit(fails.length === 0 ? 0 : 1)
