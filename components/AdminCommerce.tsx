import { listPurchases, listRefundRequests, adminDataConfigured, REASON_LABELS } from '@/lib/adminData'
import { sensitiveDataUnlocked } from '@/lib/totp'

// Purchases + refunds for the admin page.
//
// Everything here is customer data, so the defaults are deliberately timid:
//   - buyer emails arrive MASKED from the Edge Function and stay masked. There
//     is no reveal control on the page at all; unmasking requires a deliberate
//     code change, because "glance at admin" and "harvest the customer list"
//     should not be the same gesture. Screenshots leak nothing.
//   - in production the whole block is withheld unless TOTP is configured, so
//     a single shared password never fronts customer records.
//   - the data is fetched through a signed, 60-second request (lib/adminData),
//     never with a service-role key held by this site.

const card = 'rounded-xl border border-line bg-panel p-4 sm:p-5'
const section = 'mt-12 scroll-mt-16'

function money(cents: number | null, currency: string | null): string {
  if (cents === null || !currency) return '—'
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100)
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`
  }
}

function day(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'active' || status === 'refunded'
      ? status === 'active'
        ? 'bg-ok/15 text-ok'
        : 'bg-[#e06c63]/15 text-[#f0a8a2]'
      : status === 'submitted'
        ? 'bg-brass/15 text-brass'
        : 'bg-[#e06c63]/15 text-[#f0a8a2]'
  return <span className={`rounded-full px-2.5 py-0.5 font-mono text-[11px] ${tone}`}>{status}</span>
}

function Locked({ reason }: { reason: string }) {
  return (
    <div className={card}>
      <p className="text-sm text-muted">{reason}</p>
    </div>
  )
}

export default async function AdminCommerce() {
  if (!sensitiveDataUnlocked()) {
    return (
      <section id="commerce" className={section}>
        <h2 className="font-display text-xl font-medium">Purchases &amp; refunds</h2>
        <div className="mt-4">
          <Locked reason="Hidden until two-factor authentication is enabled. Set ADMIN_TOTP_SECRET and sign in again — customer emails and refund reasons are not shown behind a password alone." />
        </div>
      </section>
    )
  }

  if (!adminDataConfigured()) {
    return (
      <section id="commerce" className={section}>
        <h2 className="font-display text-xl font-medium">Purchases &amp; refunds</h2>
        <div className="mt-4">
          <Locked reason="Not configured. Set ADMIN_DATA_SECRET (32+ characters) on both Vercel and Supabase to enable this section." />
        </div>
      </section>
    )
  }

  const [purchases, refunds] = await Promise.all([listPurchases(50), listRefundRequests(50)])

  const paid = purchases?.filter((p) => p.status === 'active').length ?? 0
  const refunded = purchases?.filter((p) => p.status === 'refunded').length ?? 0
  const refundRate = paid + refunded > 0 ? `${((refunded / (paid + refunded)) * 100).toFixed(1)}%` : '—'

  return (
    <>
      <section id="purchases" className={section}>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <h2 className="font-display text-xl font-medium">Purchases</h2>
          <span className="font-mono text-xs text-faint">
            {paid} active · {refunded} refunded · {refundRate} refund rate · emails masked
          </span>
        </div>

        <div className={`${card} mt-4`}>
          {purchases === null ? (
            <p className="text-sm text-[#f0a8a2]">
              Couldn’t reach the licensing backend. Check ADMIN_DATA_SECRET matches on both sides.
            </p>
          ) : purchases.length === 0 ? (
            <p className="text-sm text-faint">No purchases yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[46rem] text-sm">
                <thead>
                  <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-wider text-faint">
                    <th className="py-2 pr-4 font-normal">Date</th>
                    <th className="py-2 pr-4 font-normal">Buyer</th>
                    <th className="py-2 pr-4 font-normal">Order</th>
                    <th className="py-2 pr-4 font-normal">Plan</th>
                    <th className="py-2 pr-4 font-normal">Attached</th>
                    <th className="py-2 font-normal">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((p) => (
                    <tr key={p.id} className="border-b border-line/60">
                      <td className="whitespace-nowrap py-2.5 pr-4 font-mono text-xs text-muted">{day(p.purchased_at)}</td>
                      <td className="break-all py-2.5 pr-4 font-mono text-xs text-muted">{p.buyer_email ?? '—'}</td>
                      <td className="break-all py-2.5 pr-4 font-mono text-[11px] text-faint">{p.order_id ?? 'legacy'}</td>
                      <td className="py-2.5 pr-4 text-xs text-faint">{p.plan}</td>
                      <td className="py-2.5 pr-4 text-xs text-faint">{p.attached ? 'yes' : 'unclaimed'}</td>
                      <td className="py-2.5">
                        <StatusPill status={p.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section id="refunds" className={section}>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <h2 className="font-display text-xl font-medium">Refunds &amp; reasons</h2>
          <span className="font-mono text-xs text-faint">
            self-serve requests from /account, inside the 14-day window
          </span>
        </div>

        <div className={`${card} mt-4`}>
          {refunds === null ? (
            <p className="text-sm text-[#f0a8a2]">Couldn’t reach the licensing backend.</p>
          ) : refunds.length === 0 ? (
            <p className="text-sm text-faint">
              No refund requests. Refunds issued directly in Polar don’t appear here — they have no
              reason attached.
            </p>
          ) : (
            <div className="space-y-3">
              {refunds.map((r) => (
                <div key={r.id} className="border-t border-line pt-3 first:border-t-0 first:pt-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-sm text-fg">{REASON_LABELS[r.reason] ?? r.reason}</span>
                    <StatusPill status={r.status} />
                    <span className="font-mono text-xs text-faint">{money(r.amount_cents, r.currency)}</span>
                    <span className="font-mono text-xs text-faint">{day(r.created_at)}</span>
                    <span className="ml-auto break-all font-mono text-[11px] text-faint">{r.order_id}</span>
                  </div>
                  {r.detail && (
                    <p className="mt-1.5 whitespace-pre-wrap border-l-2 border-line pl-3 text-sm text-muted">
                      {r.detail}
                    </p>
                  )}
                  {r.status === 'failed' && r.failure_reason && (
                    <p className="mt-1.5 font-mono text-xs text-[#f0a8a2]">
                      failed: {r.failure_reason} — licence still active, buyer can retry
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  )
}
