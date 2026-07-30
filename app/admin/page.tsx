import { Suspense } from 'react'
import Link from 'next/link'
import type { Metadata } from 'next'
import { liveVersion } from '@/lib/releases'
import { storageMode } from '@/lib/store'
import AdminCommerce from '@/components/AdminCommerce'
import AdminEmailForm from '@/components/AdminEmailForm'
import AdminInbox from '@/components/AdminInbox'
import AdminAutoRefresh from '@/components/AdminAutoRefresh'
import { adminDataConfigured, unreadMailCount } from '@/lib/adminData'
import { sensitiveDataUnlocked } from '@/lib/totp'
import OverviewTab from '@/components/admin/OverviewTab'
import ReleasesTab from '@/components/admin/ReleasesTab'
import BlogTab from '@/components/admin/BlogTab'
import FeedbackTab from '@/components/admin/FeedbackTab'
import ActivityTab from '@/components/admin/ActivityTab'
import { card, section, TabSkeleton } from '@/components/admin/ui'
import { logoutAction } from './actions'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Admin — Orchestra',
  robots: { index: false, follow: false },
}

// Tabs, not anchors, and each tab's data is fetched by the tab's own component.
//
// It used to work the other way round: one unconditional nine-call Promise.all
// at the top of this file ran for every view, so opening Email read ninety days
// of stats, every claim, every grant, the audit log, all blog posts and all
// releases out of R2 first — and then waited on a Supabase round-trip for the
// unread badge before rendering a single pixel. The comment here claimed "each
// view fetches only what it needs", which was true of exactly one line of it.
//
// Now the shell renders immediately and each section streams in under its own
// <Suspense>. A slow tab can no longer hold up the rest of the page, and a tab
// you are not looking at costs nothing at all.
const TABS = [
  ['email', 'Email'],
  ['overview', 'Overview'],
  ['purchases', 'Purchases'],
  ['releases', 'Releases'],
  ['blog', 'Blog'],
  ['feedback', 'Feedback'],
  ['activity', 'Activity'],
] as const

type TabId = (typeof TABS)[number][0]

const DEFAULT_TAB: TabId = 'email'

function resolveTab(value: string | undefined): TabId {
  return TABS.some(([id]) => id === value) ? (value as TabId) : DEFAULT_TAB
}

const ERROR_MESSAGES: Record<string, string> = {
  'invalid-version': 'That version doesn\'t look right — use the form X.Y.Z (e.g. 0.9.3).',
  'save-failed': 'Could not save — the release store is unavailable. Check storage configuration and try again.',
  'invalid-post': 'The post needs a title (the URL slug is derived from it).',
}

// The badge is its own async component so the nav paints without waiting on a
// Supabase round-trip. It used to be awaited inline before any tab rendered,
// on every page load, whichever tab was open.
async function UnreadBadge({ active }: { active: TabId }) {
  if (!sensitiveDataUnlocked() || !adminDataConfigured()) return null
  // Skip it entirely on the tab it points at: the inbox below is already
  // fetching the threads, and those carry per-thread unread counts. Asking the
  // Edge Function the same question twice per render was pure duplication —
  // and when the backend is slow it was two hangs instead of one.
  if (active === 'email') return null
  const unread = await unreadMailCount()
  if (unread <= 0) return null
  return (
    <span
      className="ml-1.5 rounded-full bg-brass px-1.5 py-0.5 text-[10px] font-semibold text-[#1a1306]"
      aria-label={`${unread} unread`}
    >
      {unread}
    </span>
  )
}

async function LiveVersion() {
  return <span className="font-mono text-xs text-faint">live v{await liveVersion()}</span>
}

function EmailTab({ thread }: { thread?: string }) {
  if (!sensitiveDataUnlocked()) {
    return (
      <section id="email" className={section}>
        <h2 className="font-display text-xl font-medium">Email</h2>
        <div className={`${card} mt-4`}>
          <p className="text-sm text-muted">
            Hidden until two-factor authentication is enabled. Set ADMIN_TOTP_SECRET and sign in
            again — customer correspondence, and a form that sends mail under your own domain,
            are not things to leave behind a password alone.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section id="email" className={section}>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <h2 className="font-display text-xl font-medium">Inbox</h2>
        <span className="font-mono text-xs text-faint">
          mail to hello@orchestra-automation.com · addresses masked · still forwarded to your mailbox
        </span>
      </div>
      <Suspense fallback={<TabSkeleton rows={2} />}>
        <AdminInbox openThreadId={thread} />
      </Suspense>

      <div className="mt-8 flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <h2 className="font-display text-xl font-medium">Start a new email</h2>
        <span className="font-mono text-xs text-faint">
          from hello@orchestra-automation.com · replies come back to the inbox above
        </span>
      </div>
      <div className={`${card} mt-4`}>
        <AdminEmailForm />
      </div>
    </section>
  )
}

function TabBody({ active, thread }: { active: TabId; thread?: string }) {
  switch (active) {
    case 'email':
      return <EmailTab thread={thread} />
    case 'overview':
      return <OverviewTab />
    case 'purchases':
      return <AdminCommerce />
    case 'releases':
      return <ReleasesTab />
    case 'blog':
      return <BlogTab />
    case 'feedback':
      return <FeedbackTab />
    case 'activity':
      return <ActivityTab />
  }
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; tab?: string; thread?: string }>
}) {
  const { error, tab, thread } = await searchParams
  const active = resolveTab(tab)
  const storage = storageMode()

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 pb-16 sm:px-8">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1 pt-8">
        <h1 className="font-display text-2xl font-medium tracking-tight sm:text-3xl">Orchestra admin</h1>
        <Suspense fallback={<span className="font-mono text-xs text-faint">live v…</span>}>
          <LiveVersion />
        </Suspense>
        <span className="font-mono text-xs text-faint">storage: {storage}</span>
        {/* Only where freshness earns the cost: new mail and moving numbers. */}
        {(active === 'email' || active === 'overview') && <AdminAutoRefresh />}
        <div className="ml-auto flex items-center gap-4">
          <a href="/releases" className="font-mono text-xs text-muted hover:text-fg">/releases →</a>
          <form action={logoutAction}>
            <button className="font-mono text-xs text-faint hover:text-fg">sign out</button>
          </form>
        </div>
      </header>

      <nav
        aria-label="Sections"
        className="sticky top-0 z-10 -mx-4 mt-4 flex gap-1 overflow-x-auto border-b border-line bg-bg/90 px-4 py-2 backdrop-blur-md sm:-mx-8 sm:px-8"
      >
        {TABS.map(([id, label]) => (
          <Link
            key={id}
            href={id === DEFAULT_TAB ? '/admin' : `/admin?tab=${id}`}
            // Never prefetch. Every one of these targets is force-dynamic, so a
            // prefetch is not a cheap cache warm — it is a FULL render of that
            // tab, including its Supabase round-trips. Seven links sit in a
            // sticky nav that is always in the viewport, so the default
            // behaviour fires seven complete page renders the moment /admin
            // loads, and again after every router.refresh(). That is what made
            // the page appear to hang: a storm of 200s and a busy main thread,
            // for tabs nobody had clicked.
            prefetch={false}
            aria-current={active === id ? 'page' : undefined}
            className={`whitespace-nowrap rounded-md px-3 py-1 font-mono text-xs transition-colors ${
              active === id ? 'bg-well text-fg' : 'text-muted hover:bg-well hover:text-fg'
            }`}
          >
            {label}
            {id === 'email' && (
              <Suspense fallback={null}>
                <UnreadBadge active={active} />
              </Suspense>
            )}
          </Link>
        ))}
      </nav>

      {error && ERROR_MESSAGES[error] && (
        <p className="mt-4 rounded-lg border border-[#e06c63]/40 bg-[#e06c63]/10 px-4 py-3 text-sm text-[#f0a8a2]">
          {ERROR_MESSAGES[error]}
        </p>
      )}

      {storage === 'local' && process.env.VERCEL && (
        <p className="mt-4 rounded-lg border border-[#e06c63]/40 bg-[#e06c63]/10 px-4 py-3 text-sm text-[#f0a8a2]">
          R2 storage is not configured — data won&apos;t persist on Vercel. Set R2_ENDPOINT, R2_BUCKET,
          R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY.
        </p>
      )}

      <Suspense key={`${active}-${thread ?? ''}`} fallback={<TabSkeleton />}>
        <TabBody active={active} thread={thread} />
      </Suspense>
    </main>
  )
}
