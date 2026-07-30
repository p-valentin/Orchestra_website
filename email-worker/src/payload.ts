// The pure half of the Worker: turning a parsed email into the JSON the ingest
// endpoint accepts, and signing the request.
//
// Split out from index.ts so it can be tested without a Cloudflare runtime, a
// network, or a deploy — which matters more than usual here, because this
// Worker cannot be run locally against the real mail route and the first live
// message will be a stranger's.
//
// Nothing here decides anything. It reshapes and truncates; the ingest function
// re-derives and re-validates everything it is sent (supabase/functions/
// _shared/mail.ts), on the assumption that this file could be replaced by an
// attacker who obtained the signing secret.

export interface ParsedAddress {
  address?: string
  name?: string
}

// The subset of postal-mime's output this Worker uses.
export interface ParsedEmail {
  from?: ParsedAddress
  to?: ParsedAddress[]
  subject?: string
  messageId?: string
  inReplyTo?: string
  references?: string | string[]
  text?: string
  html?: string
  attachments?: { filename?: string; mimeType?: string; content?: ArrayBuffer | Uint8Array }[]
}

export interface IngestPayload {
  envelope_from: string
  envelope_to: string
  from: string
  to: string
  subject: string
  message_id: string | null
  in_reply_to: string | null
  references: string[]
  text: string
  html: string
  attachments: { name: string; size: number; type: string }[]
  auth_results: string | null
}

// Cut here rather than at the endpoint so a 40 MB newsletter never crosses the
// wire. Comfortably above any real support email; the ingest function caps
// again at its own, lower limits.
const MAX_TEXT = 128 * 1024
const MAX_HTML = 256 * 1024
const MAX_ATTACHMENTS = 20

function addressOf(a: ParsedAddress | undefined): string {
  return typeof a?.address === 'string' ? a.address : ''
}

// "Foo Bar <foo@example.com>" — kept as written so the admin page can show what
// the sender CLAIMED, next to the envelope address that actually routed. The
// ingest function stores them in separate columns for the same reason.
function displayOf(a: ParsedAddress | undefined): string {
  if (!a) return ''
  const name = typeof a.name === 'string' ? a.name.trim() : ''
  const address = addressOf(a)
  if (name && address) return `${name} <${address}>`
  return address || name
}

export function buildIngestPayload(input: {
  envelopeFrom: string
  envelopeTo: string
  authResults: string | null
  parsed: ParsedEmail
}): IngestPayload {
  const { parsed } = input

  const references = Array.isArray(parsed.references)
    ? parsed.references
    : typeof parsed.references === 'string'
      ? parsed.references.split(/\s+/)
      : []

  return {
    // The envelope, from Cloudflare rather than from the message. This is the
    // pair the receiving MTA actually routed on.
    envelope_from: input.envelopeFrom,
    envelope_to: input.envelopeTo,
    // The headers, as the sender wrote them. Display only, at both ends.
    from: displayOf(parsed.from),
    to: displayOf(parsed.to?.[0]),
    subject: typeof parsed.subject === 'string' ? parsed.subject.slice(0, 400) : '',
    message_id: typeof parsed.messageId === 'string' ? parsed.messageId.slice(0, 400) : null,
    in_reply_to: typeof parsed.inReplyTo === 'string' ? parsed.inReplyTo.slice(0, 400) : null,
    references: references.filter((r) => typeof r === 'string' && r.length > 0).slice(0, 25),
    text: typeof parsed.text === 'string' ? parsed.text.slice(0, MAX_TEXT) : '',
    html: typeof parsed.html === 'string' ? parsed.html.slice(0, MAX_HTML) : '',
    // Names and sizes only — never the bytes. The attachment itself stays in
    // the mailbox this message was also forwarded to, which is a place already
    // built to hold strangers' files. An ingest endpoint that accepted them
    // would be an unauthenticated upload API with extra steps.
    attachments: (parsed.attachments ?? []).slice(0, MAX_ATTACHMENTS).map((a) => ({
      name: typeof a.filename === 'string' ? a.filename.slice(0, 120) : '(unnamed)',
      size: a.content ? a.content.byteLength : 0,
      type: typeof a.mimeType === 'string' ? a.mimeType.slice(0, 100) : 'application/octet-stream',
    })),
    // What Cloudflare's MTA concluded about SPF/DKIM/DMARC. Forwarded so a
    // person reading the thread can see whether the From: line is plausible.
    auth_results: input.authResults ? input.authResults.slice(0, 1000) : null,
  }
}

// ---------- request signing ----------
//
// Mirrors supabase/functions/_shared/admin-auth.ts exactly:
//
//   sig = HMAC-SHA256("<ts>.<METHOD>.<last path segment>.<sha256hex(body)>", secret)
//
// If one side drifts the other returns 404 and mail silently stops appearing in
// /admin — so the ingest tests sign with this same scheme rather than a copy of
// the server's, and fail loudly when the two disagree.

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

function canonicalPath(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean)
  return `/${parts[parts.length - 1] ?? ''}`
}

export async function signRequest(
  secret: string,
  method: string,
  url: string,
  body: string,
  ts: number = Math.floor(Date.now() / 1000),
): Promise<Record<string, string>> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const content = `${ts}.${method.toUpperCase()}.${canonicalPath(new URL(url).pathname)}.${await sha256Hex(body)}`
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(content))
  return {
    'Content-Type': 'application/json',
    'x-orchestra-ts': String(ts),
    'x-orchestra-sig': `v1,${btoa(String.fromCharCode(...new Uint8Array(mac)))}`,
  }
}
