import { type NextRequest } from 'next/server'
import { rateLimit } from '@/lib/rateLimit'
import { sanitizeText, isValidEmail } from '@/lib/sanitize'
import { appendFeedback, type FeedbackEntry, type FeedbackKind } from '@/lib/feedback'
import { sendEmail } from '@/lib/email'

// JSON endpoint for the desktop app's feedback + testimonial flow. The caller is
// the Electron main process (Node), not a browser, so no CORS handling is needed.

const KINDS = new Set<FeedbackKind>(['bug', 'feature', 'other', 'testimonial'])

function requestIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0]!.trim()
  return req.headers.get('x-real-ip') ?? 'unknown'
}

function shortMeta(v: unknown): string {
  return typeof v === 'string' ? v.replace(/[^\w.\- :]/g, '').slice(0, 40) : ''
}

// Keep log formatting (newlines/tabs/CR) but drop other control chars; hard cap.
const LOG_CONTROL = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]', 'g')
function cleanLogs(v: unknown): string {
  if (typeof v !== 'string') return ''
  return v.replace(LOG_CONTROL, '').slice(0, 8000)
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

// Logs are capped at 8 KB and every other field is small, so a legitimate
// payload is well under this. Reject oversized bodies before buffering them.
const MAX_BODY = 64 * 1024

export async function POST(request: NextRequest) {
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY) {
    return Response.json({ ok: false, error: 'too-large' }, { status: 413 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ ok: false, error: 'bad-json' }, { status: 400 })
  }

  if (!rateLimit('feedback:' + requestIp(request)).allowed) {
    return Response.json({ ok: false, error: 'rate-limited' }, { status: 429 })
  }

  const kind = body.kind
  if (typeof kind !== 'string' || !KINDS.has(kind as FeedbackKind)) {
    return Response.json({ ok: false, error: 'bad-kind' }, { status: 400 })
  }

  const message = sanitizeText(body.message, 4000)
  if (message.length < 2) {
    return Response.json({ ok: false, error: 'empty-message' }, { status: 400 })
  }

  const name = sanitizeText(body.name, 80)
  const handle = sanitizeText(body.handle, 80)
  const emailRaw = sanitizeText(body.email, 254)
  const email = emailRaw && isValidEmail(emailRaw) ? emailRaw : ''
  const metaIn = (body.meta && typeof body.meta === 'object' && !Array.isArray(body.meta))
    ? body.meta as Record<string, unknown>
    : {}
  const logs = cleanLogs(body.logs)

  const entry: FeedbackEntry = {
    id: newId(),
    kind: kind as FeedbackKind,
    ...(name && { name }),
    ...(email && { email }),
    ...(handle && { handle }),
    message,
    meta: {
      version: shortMeta(metaIn.version),
      platform: shortMeta(metaIn.platform),
      arch: shortMeta(metaIn.arch),
      ts: shortMeta(metaIn.ts),
    },
    ...(logs && { logs }),
    at: new Date().toISOString(),
  }

  const stored = await appendFeedback(entry)

  const who = [name, email || handle].filter(Boolean).join(' · ') || 'anonymous'
  const subject = kind === 'testimonial'
    ? `New Orchestra testimonial — ${who}`
    : `Orchestra ${kind} — ${who}`
  // Notification only; never include full logs in the email body.
  await sendEmail(
    subject,
    `${message}\n\n— ${who}\nv${entry.meta?.version} · ${entry.meta?.platform} ${entry.meta?.arch}`,
    email || undefined,
  )

  return Response.json({ ok: stored }, { status: stored ? 200 : 500 })
}
