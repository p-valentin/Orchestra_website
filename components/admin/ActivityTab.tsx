import { listAudit } from '@/lib/audit'
import { card, formatTime, section } from './ui'

export default async function ActivityTab() {
  const audit = await listAudit()
  return (
    <section id="activity" className={section}>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <h2 className="font-display text-xl font-medium">Recent activity</h2>
        <span className="font-mono text-xs text-faint">logins and admin actions · last {audit.length}</span>
      </div>
      <div className={`${card} mt-4`}>
        {audit.length === 0 ? (
          <p className="text-sm text-faint">Nothing yet — actions and logins will show up here.</p>
        ) : (
          <div>
            {audit.map((entry, i) => (
              <div key={`${entry.at}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line py-2 first:border-t-0">
                <span className="font-mono text-xs text-faint">{formatTime(entry.at)}</span>
                <span className={`rounded-full px-2.5 py-0.5 font-mono text-[11px] ${entry.action === 'login-failed' ? 'bg-[#e06c63]/15 text-[#f0a8a2]' : 'bg-well text-muted'}`}>
                  {entry.action}
                </span>
                {entry.detail && <span className="break-all font-mono text-xs text-muted">{entry.detail}</span>}
                {entry.ip && <span className="ml-auto font-mono text-[11px] text-faint">{entry.ip}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
