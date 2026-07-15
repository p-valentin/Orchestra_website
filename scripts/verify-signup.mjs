// Does the signup page actually work?
//
//   npm run dev                                   # in one shell
//   SUPABASE_ACCESS_TOKEN=… node scripts/verify-signup.mjs
//
// Drives the real form in a real browser against the real Supabase, then
// follows the confirmation link the way a buyer's email client would. Written
// after shipping a /signup page that could never have worked: the CSP said
// `connect-src 'self'`, so every submission died as "Failed to fetch" while
// the page itself rendered perfectly. Rendering is not working.
//
// Uses a +tag on the owner's own address, because Resend rejects reserved
// domains like .test — and a signup whose mail can't be delivered is not the
// flow customers hit. Deletes the account afterwards.

// playwright lives in the app repo; this is the only place the website needs it.
import { chromium } from '../../Orchestra/node_modules/playwright/index.mjs'
import { createClient } from '@supabase/supabase-js'

const REF = process.env.SUPABASE_PROJECT_REF ?? 'jxcxtwmqwontjttywxlt'
const SB = process.env.SUPABASE_ACCESS_TOKEN
if (!SB) throw new Error('SUPABASE_ACCESS_TOKEN is required (creates/removes the test account)')
const SITE = process.env.SITE_URL ?? 'http://localhost:3000'
const INBOX = process.env.TEST_INBOX ?? 'valivali10298@gmail.com'
const [box, domain] = INBOX.split('@')
const EMAIL = `${box}+signup${Date.now().toString().slice(-6)}@${domain}`
const PASSWORD = 'orchestra-signup-test-123'

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

const browser = await chromium.launch()
const page = await browser.newPage()
const consoleErrors = []
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
page.on('pageerror', (e) => consoleErrors.push(String(e)))

let userId = null
try {
  // 1. The form.
  await page.goto(`${SITE}/signup`, { waitUntil: 'networkidle' })
  check(await page.locator('h1').innerText() === 'Create your account', 'signup page renders')

  await page.fill('input[name="email"]', EMAIL)
  await page.fill('input[name="password"]', PASSWORD)

  // 2. Short password must be refused BEFORE any round-trip.
  await page.fill('input[name="password"]', 'short')
  await page.click('button[type="submit"]')
  await page.waitForTimeout(400)
  check(
    (await page.locator("form p[role=\"alert\"]").count()) > 0 &&
    (await page.locator("form p[role=\"alert\"]").innerText()).includes('8 characters'),
    'rejects a short password without asking the server',
  )

  // 3. The real thing.
  await page.fill('input[name="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForSelector('[role="status"]', { timeout: 20_000 })
  const status = await page.locator('[role="status"]').innerText()
  check(status.includes('Check') && status.includes(EMAIL), 'form reports the confirmation email was sent', status)
  const realErrors = consoleErrors.filter((e) =>
    !/eval\(\) is not supported/.test(e) &&        // React dev mode only
    !/va\.vercel-scripts\.com/.test(e))            // analytics debug script, dev only
  check(realErrors.length === 0, 'no console errors that would exist in production', realErrors.slice(0, 2))

  // 4. Did an account actually appear?
  const { data: list } = await admin.auth.admin.listUsers()
  const user = list.users.find((u) => u.email === EMAIL)
  userId = user?.id ?? null
  check(!!user, 'account created in Supabase')
  check(!!user && !user.email_confirmed_at, 'and is UNCONFIRMED — no trial until the inbox is proven')
  check(!!user?.confirmation_sent_at, 'confirmation email was dispatched (Resend accepted it)')

  // 5. Signing in before confirming must fail — otherwise the gate is theatre.
  const anon = createClient(`https://${REF}.supabase.co`, key('anon'), { auth: { persistSession: false } })
  const { error: earlyErr } = await anon.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  check(!!earlyErr, `unconfirmed sign-in refused (${earlyErr?.message})`)

  // 6. Follow the confirmation link, as the email client would.
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'signup', email: EMAIL, password: PASSWORD,
    options: { redirectTo: `${SITE}/welcome` },
  })
  check(!linkErr, 'confirmation link generated', linkErr?.message)

  const verifyUrl = link.properties.action_link
  await page.goto(verifyUrl, { waitUntil: 'networkidle' })
  // The allow-list decides whether we land on /welcome or get bounced to site_url.
  check(page.url().includes('/welcome'), `confirmation link lands on /welcome (got ${page.url().split('#')[0]})`)
  check((await page.locator('h1').innerText()) === 'Account confirmed', 'welcome page renders')

  // 7. And now the account works.
  const { data: session, error: signInErr } = await anon.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  check(!signInErr && !!session.session, 'sign-in works after confirming', signInErr?.message)
} finally {
  await browser.close()
  if (userId) await admin.auth.admin.deleteUser(userId)
  const { data: left } = await admin.auth.admin.listUsers()
  console.log(`\ncleanup: removed the test account; ${left.users.length} account(s) left in prod`)
}

console.log(`\n${fails.length === 0 ? 'SIGNUP WORKS' : 'FAILURES'}: ${pass} passed, ${fails.length} failed`)
for (const f of fails) console.log(`  - ${f}`)
process.exit(fails.length === 0 ? 0 : 1)
