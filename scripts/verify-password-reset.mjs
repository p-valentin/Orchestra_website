// Does password reset actually work?
//
//   npm run dev                                          # in one shell
//   SUPABASE_ACCESS_TOKEN=… node scripts/verify-password-reset.mjs
//
// Drives /forgot-password and /reset-password in a real browser against the
// real Supabase, exactly as a user clicking an emailed link would. The reset
// page waits for a recovery SESSION parsed from the URL fragment — a distinct
// flow from signup, and the kind of thing that renders fine while doing
// nothing. Verified end to end: request → link → new password → sign in with
// the new one, and the OLD one stops working.
//
// Creates a temporary account, resets it, and deletes it afterwards.

import { chromium } from '../../Orchestra/node_modules/playwright/index.mjs'
import { createClient } from '@supabase/supabase-js'

const REF = process.env.SUPABASE_PROJECT_REF ?? 'jxcxtwmqwontjttywxlt'
const SB = process.env.SUPABASE_ACCESS_TOKEN
if (!SB) throw new Error('SUPABASE_ACCESS_TOKEN is required (creates/removes the test account)')
const SITE = process.env.SITE_URL ?? 'http://localhost:3000'
const INBOX = process.env.TEST_INBOX ?? 'valivali10298@gmail.com'
const [box, domain] = INBOX.split('@')
const EMAIL = `${box}+reset${Date.now().toString().slice(-6)}@${domain}`
const OLD_PASSWORD = 'orchestra-old-password-123'
const NEW_PASSWORD = 'orchestra-new-password-456'

let pass = 0
const fails = []
const check = (cond, label, detail) => {
  if (cond) { pass++; console.log(`  ok  ${label}`) }
  else { fails.push(label); console.log(`FAIL  ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 200)}`}`) }
}

const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, {
  headers: { Authorization: `Bearer ${SB}` },
})).json()
const key = (n) => keys.find((k) => k.name === n).api_key
const admin = createClient(`https://${REF}.supabase.co`, key('service_role'), { auth: { persistSession: false } })
const anon = createClient(`https://${REF}.supabase.co`, key('anon'), { auth: { persistSession: false } })

const browser = await chromium.launch()
const page = await browser.newPage()
const consoleErrors = []
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
page.on('pageerror', (e) => consoleErrors.push(String(e)))

let userId = null
try {
  // A confirmed account to reset.
  const { data: created, error } = await admin.auth.admin.createUser({
    email: EMAIL, password: OLD_PASSWORD, email_confirm: true,
  })
  if (error) throw new Error(`createUser: ${error.message}`)
  userId = created.user.id

  // 1. Request a reset.
  await page.goto(`${SITE}/forgot-password`, { waitUntil: 'networkidle' })
  check((await page.locator('h1').innerText()) === 'Reset your password', 'forgot-password page renders')
  await page.fill('input[name="email"]', EMAIL)
  await page.click('button[type="submit"]')
  await page.waitForSelector('[role="status"]', { timeout: 20_000 })
  const sent = await page.locator('[role="status"]').innerText()
  check(/reset link/i.test(sent), 'request confirms a link was sent', sent)
  check(!sent.includes(EMAIL) || /if that email/i.test(sent), 'does not confirm whether the address exists (no oracle)', sent)

  // 2. A request for an address with NO account must look identical.
  await page.goto(`${SITE}/forgot-password`, { waitUntil: 'networkidle' })
  await page.fill('input[name="email"]', `no-such-user-${Date.now()}@example.com`)
  await page.click('button[type="submit"]')
  await page.waitForSelector('[role="status"]', { timeout: 20_000 })
  check(/reset link/i.test(await page.locator('[role="status"]').innerText()), 'unknown address gets the same response', null)

  // 3. Follow the recovery link, as the mail client would.
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'recovery', email: EMAIL })
  check(!linkErr, 'recovery link generated', linkErr?.message)

  // The action_link points at Supabase's verify endpoint, which redirects to
  // our /reset-password with the recovery token in the fragment.
  const actionLink = link.properties.action_link.replace(/redirect_to=[^&]*/, `redirect_to=${encodeURIComponent(SITE + '/reset-password')}`)
  await page.goto(actionLink, { waitUntil: 'networkidle' })
  check(page.url().includes('/reset-password'), `lands on /reset-password (got ${page.url().split('#')[0]})`)

  // 4. The form must appear (recovery session detected), not the "invalid link"
  //    state.
  await page.waitForSelector('input[name="password"]', { timeout: 6_000 }).catch(() => {})
  const hasForm = (await page.locator('input[name="password"]').count()) > 0
  check(hasForm, 'recovery session detected — the new-password form shows', {
    body: (await page.locator('body').innerText()).slice(0, 160),
  })

  if (hasForm) {
    // 5. Set the new password.
    await page.fill('input[name="password"]', NEW_PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForSelector('[role="status"]', { timeout: 20_000 })
    check(/changed/i.test(await page.locator('[role="status"]').innerText()), 'reports the password was changed', null)
  }

  // 6. New password works; old one is dead.
  const withNew = await anon.auth.signInWithPassword({ email: EMAIL, password: NEW_PASSWORD })
  check(!withNew.error && !!withNew.data.session, 'sign-in works with the NEW password', withNew.error?.message)
  const withOld = await anon.auth.signInWithPassword({ email: EMAIL, password: OLD_PASSWORD })
  check(!!withOld.error, 'the OLD password no longer works', null)

  const realErrors = consoleErrors.filter((e) => !/eval\(\) is not supported/.test(e) && !/va\.vercel-scripts\.com/.test(e))
  check(realErrors.length === 0, 'no console errors that would exist in production', realErrors.slice(0, 2))
} finally {
  await browser.close()
  if (userId) await admin.auth.admin.deleteUser(userId)
  const { data: left } = await admin.auth.admin.listUsers()
  console.log(`\ncleanup: removed the test account; ${left.users.length} account(s) left in prod`)
}

console.log(`\n${fails.length === 0 ? 'PASSWORD RESET WORKS' : 'FAILURES'}: ${pass} passed, ${fails.length} failed`)
for (const f of fails) console.log(`  - ${f}`)
process.exit(fails.length === 0 ? 0 : 1)
