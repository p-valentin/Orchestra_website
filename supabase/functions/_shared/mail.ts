// Handling for mail we did not write.
//
// Everything in this file exists because an inbound email is the only input to
// this system that a complete stranger composes end to end, and its destination
// is /admin — the one page that renders customer data. So the posture is:
// nothing arrives as itself. Addresses are re-derived, subjects are normalised,
// markup is rebuilt from an allowlist rather than filtered, and every string is
// capped before it reaches the database.

// Caps. Chosen so a real support email is never touched and a hostile one
// cannot be interesting: the longest genuine message anyone has sent this
// address is a few kilobytes. The database carries matching check constraints
// at roughly double these, so a bug here fails an insert instead of filling a
// table (see migration 0010).
export const MAX_SUBJECT = 200
export const MAX_EMAIL = 254
export const MAX_BODY_TEXT = 64 * 1024
export const MAX_BODY_HTML = 192 * 1024
export const MAX_HEADER_ID = 400
export const MAX_REFERENCES = 25
export const MAX_ATTACHMENTS = 20
export const MAX_ATTACHMENT_NAME = 120
export const MAX_AUTH_RESULTS = 1000

// Every control byte. For headers, where a newline is not content — it is how
// one header value becomes two headers, and how a subject becomes two lines of
// a rendered list.
const CONTROL_ALL = new RegExp('[\\u0000-\\u001F\\u007F]', 'g')

// Every control byte except tab and newline, which in a body ARE the content.
const CONTROL_IN_BODY = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]', 'g')

export function cleanHeader(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return value.replace(CONTROL_ALL, '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function cleanBody(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(CONTROL_IN_BODY, '')
}

// "Foo Bar" <foo@example.com>  ->  foo@example.com
//
// Re-derived rather than trusted: the display part is free text and has been a
// phishing surface since forever ("support@orchestra-automation.com" <evil@x>).
// Returns '' when there is no address-shaped thing in there at all, which
// callers treat as a reason to drop the message rather than to guess.
const EMAIL_RE = /^[^\s@<>,;"']+@[^\s@<>,;"']+\.[^\s@<>,;"']{2,}$/

export function normaliseEmail(raw: unknown): string {
  const cleaned = cleanHeader(raw, 1000)
  if (!cleaned) return ''
  // Last <...> wins: "a@b.com <real@c.com>" should resolve to the routable one.
  const angled = cleaned.match(/<([^<>]*)>\s*$/)
  const candidate = (angled ? angled[1] : cleaned).trim().replace(/^mailto:/i, '').toLowerCase()
  if (candidate.length > MAX_EMAIL) return ''
  return EMAIL_RE.test(candidate) ? candidate : ''
}

// Reply prefixes across the clients that actually turn up: English, German
// (AW/WG), Swedish/Norwegian (SV/VS), French (RE/TR), Spanish/Italian (RV),
// plus the "Re[2]:" and "Re :" spellings. Stripped repeatedly because a thread
// that has been round a few times accumulates them.
const REPLY_PREFIX = /^\s*(?:(?:re|aw|wg|sv|vs|fw|fwd|tr|rv|antw|odp)\s*(?:\[\d+\])?\s*:)\s*/i

// The thread key. "Re: Licence not working" and "licence not working  " are one
// conversation; the key has to say so without depending on the sender's client.
export function normaliseSubject(subject: string): string {
  let s = cleanHeader(subject, MAX_SUBJECT * 2)
  // Loop rather than one global regex: "Re: Fwd: Re: x" needs three passes.
  for (let i = 0; i < 10; i++) {
    const next = s.replace(REPLY_PREFIX, '')
    if (next === s) break
    s = next
  }
  const key = s.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, MAX_SUBJECT)
  // A subject of nothing but "Re:" is a real thing people send. Give it a
  // stable key of its own rather than grouping every empty subject from every
  // sender together — the participant is part of the key, so this is per-person.
  return key || '(no subject)'
}

export function displaySubject(subject: string): string {
  return cleanHeader(subject, MAX_SUBJECT) || '(no subject)'
}

// What a THREAD is called. Reply prefixes stripped but capitalisation kept, so
// a conversation is titled "Refund — bought twice by mistake" rather than
// "Re: Refund — bought twice by mistake" just because the last message in it
// happened to be a reply. A prefix is a mail client's bookkeeping, not a rename.
export function threadTitle(subject: string): string {
  let base = cleanHeader(subject, MAX_SUBJECT)
  for (let i = 0; i < 10; i++) {
    const next = base.replace(REPLY_PREFIX, '')
    if (next === base) break
    base = next
  }
  return base.trim() || '(no subject)'
}

// A reply keeps the conversation's subject with one Re: on the front, however
// many the incoming mail had.
export function replySubject(subject: string): string {
  let base = cleanHeader(subject, MAX_SUBJECT)
  for (let i = 0; i < 10; i++) {
    const next = base.replace(REPLY_PREFIX, '')
    if (next === base) break
    base = next
  }
  return `Re: ${base.trim() || '(no subject)'}`.slice(0, MAX_SUBJECT)
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

// The idempotency key described in migration 0010. A Message-ID is what the
// sending MTA guarantees to be unique, so it is used when present; the fallback
// hashes the message itself, which is the same message twice by any useful
// definition.
export async function dedupeHash(m: {
  messageId?: string
  from: string
  to: string
  subject: string
  body: string
}): Promise<string> {
  const id = cleanHeader(m.messageId, MAX_HEADER_ID)
  if (id) return await sha256Hex(`mid:${id}`)
  // JSON rather than a joined string: quoting and escaping delimit the fields,
  // so no rearrangement of values can produce the same digest. A separator
  // character would have to be one that cannot appear in a message body, and
  // there isn't one — the obvious pick, a NUL, is a byte with no business
  // sitting in source code.
  return await sha256Hex(`body:${JSON.stringify([m.from, m.to, m.subject, m.body])}`)
}

// ---------- HTML ----------
//
// The output of sanitiseHtml is BUILT, not filtered: text is escaped and
// re-emitted, and a tag appears in the result only because it was on the
// allowlist and its attributes were rewritten. Nothing passes through
// untouched, so there is no "clever encoding slips past the regex" class of
// bug — an encoding this parser mis-reads produces escaped text, not markup.
//
// The admin page still does not render the result as HTML (it renders the text
// part). This is the second barrier, not the only one.

// No img: a remote image is a read receipt for whoever sent it, telling a
// stranger the moment an admin opened their mail, and a data: image is an
// unbounded blob. No style/link/meta/base/form/input/iframe/object/embed/svg:
// each is either script-capable, layout-capable over the surrounding page, or a
// way to make the admin page issue a request it did not choose to issue.
const ALLOWED_TAGS = new Set([
  'p', 'br', 'hr', 'div', 'span', 'a', 'b', 'strong', 'i', 'em', 'u', 's', 'strike',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'blockquote', 'pre', 'code', 'small', 'sub', 'sup',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption',
])

// Elements whose CONTENT is not text and must be discarded along with the tag.
const VOID_CONTENT_TAGS = new Set([
  'script', 'style', 'title', 'noscript', 'template', 'iframe', 'object', 'embed',
  'applet', 'svg', 'math', 'head', 'xmp', 'frameset',
])

const SELF_CLOSING = new Set(['br', 'hr'])

// Per-tag attribute allowlist. Deliberately tiny. No style (CSS is a scripting
// surface in its own right and can cover the page it is rendered on), no class
// or id (they would collide with the admin page's own), no width/height.
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href']),
  td: new Set(['colspan', 'rowspan']),
  th: new Set(['colspan', 'rowspan']),
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// http, https and mailto only. Everything else — javascript:, data:, vbscript:,
// file:, a protocol-relative //host, or a scheme obfuscated with the tabs and
// newlines browsers used to tolerate — becomes no href at all.
const URL_JUNK = new RegExp('[\\u0000-\\u0020]', 'g')

function safeHref(raw: string): string | null {
  const value = raw.replace(URL_JUNK, '').toLowerCase()
  if (value.startsWith('//')) return null
  if (/^(https?:|mailto:)/.test(value)) return raw.trim().slice(0, 2000)
  // A relative link inside an email is meaningless (relative to what?), and on
  // the admin page it would resolve against /admin.
  return null
}

function parseAttrs(raw: string): [string, string][] {
  const out: [string, string][] = []
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw)) !== null) {
    out.push([m[1].toLowerCase(), m[2] ?? m[3] ?? m[4] ?? ''])
    if (out.length > 64) break
  }
  return out
}

export function sanitiseHtml(input: string): string {
  const html = cleanBody(input).slice(0, MAX_BODY_HTML * 2)
  let out = ''
  let i = 0
  // The tag whose content is currently being discarded, so that a </style>
  // inside a <script> does not end the skip early.
  let skipping: string | null = null

  // A tag name must follow '<' immediately — "5 < 6" is text, not an element
  // called "6". This mirrors the HTML parser a browser would use, which is the
  // property that matters: anything this file reads as text must be something
  // no downstream parser would read as markup.
  const TAG_RE = /^<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:"[^"]*"|'[^']*'|[^>])*)>/

  // Entities are decoded before being re-escaped, exactly once, the way a
  // browser does it. Without the decode, "&mdash;" would be stored as the
  // literal text "&mdash;" instead of an em dash — and, worse, an entity-
  // encoded scheme in an href would slip past the check in safeHref.
  const text = (s: string) => escapeHtml(decodeEntities(s))

  while (i < html.length) {
    if (out.length >= MAX_BODY_HTML) break

    const lt = html.indexOf('<', i)
    if (lt === -1) {
      if (!skipping) out += text(html.slice(i))
      break
    }
    if (!skipping) out += text(html.slice(i, lt))

    const rest = html.slice(lt)

    // Comments, including the conditional ones Outlook emits. Dropped whole: a
    // comment can hide a payload that a lenient parser downstream un-hides.
    if (rest.startsWith('<!--')) {
      const end = html.indexOf('-->', lt + 4)
      i = end === -1 ? html.length : end + 3
      continue
    }
    // <!doctype ...>, <![CDATA[...]]>, <?xml ...?>
    if (rest.startsWith('<!') || rest.startsWith('<?')) {
      const end = html.indexOf('>', lt + 2)
      i = end === -1 ? html.length : end + 1
      continue
    }

    const m = TAG_RE.exec(rest)
    if (!m) {
      // A '<' that does not open a tag — "5 < 6". Escaped, never emitted raw.
      if (!skipping) out += '&lt;'
      i = lt + 1
      continue
    }

    const closing = m[1] === '/'
    const tag = m[2].toLowerCase()
    i = lt + m[0].length

    if (skipping) {
      if (closing && tag === skipping) skipping = null
      continue
    }
    if (VOID_CONTENT_TAGS.has(tag)) {
      if (!closing) skipping = tag
      continue
    }
    // Anything unrecognised loses its tag but keeps its text: an unknown
    // element is far more likely to be a mail client's quirk than an attack,
    // and swallowing the words inside it would lose the message.
    if (!ALLOWED_TAGS.has(tag)) continue

    if (closing) {
      if (!SELF_CLOSING.has(tag)) out += `</${tag}>`
      continue
    }

    const allowed = ALLOWED_ATTRS[tag]
    let attrs = ''
    if (allowed) {
      for (const [name, rawValue] of parseAttrs(m[3])) {
        if (!allowed.has(name)) continue
        // Decoded first, because a browser decodes attribute values before
        // resolving them: href="javascript&#58;alert(1)" is a javascript: URL
        // to everything downstream, and checking the undecoded string would
        // wave it through.
        const value = decodeEntities(rawValue)
        if (name === 'href') {
          const href = safeHref(value)
          if (href) attrs += ` href="${escapeHtml(href)}"`
        } else if (/^\d{1,3}$/.test(value)) {
          attrs += ` ${name}="${value}"`
        }
      }
    }
    // target is dropped by omission (it is on no allowlist) and rel is asserted
    // rather than copied: whatever the sender wrote, a link out of a stranger's
    // email opens with no window handle back to the admin page and no referrer
    // carrying the admin URL.
    if (tag === 'a') attrs += ' rel="noopener noreferrer nofollow ugc"'
    out += SELF_CLOSING.has(tag) ? `<${tag}>` : `<${tag}${attrs}>`
  }

  if (out.length > MAX_BODY_HTML) {
    // Cut at a tag boundary where there is one, so the stored value does not
    // end halfway through an element. It is never rendered, but a truncation
    // that leaves `<a href="https://ex` is the kind of thing that becomes a
    // problem the day somebody decides to render it after all.
    const boundary = out.lastIndexOf('>', MAX_BODY_HTML)
    out = boundary > 0 ? out.slice(0, boundary + 1) : out.slice(0, MAX_BODY_HTML)
  }
  return out
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–',
  hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', trade: '™', copy: '©', reg: '®',
}

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10)
      // Only the printable ranges: a numeric entity is otherwise a way to
      // reintroduce the control characters cleanBody just removed.
      if (Number.isFinite(code) && code >= 32 && code !== 127 && code <= 0x10ffff) {
        try {
          return String.fromCodePoint(code)
        } catch {
          return ''
        }
      }
      return ''
    }
    return ENTITIES[body.toLowerCase()] ?? whole
  })
}

// A readable text version of an HTML-only message, so the admin page always has
// something to render without ever rendering markup. Runs on the SANITISED
// html, so it can only ever see tags this file emitted.
export function htmlToText(sanitised: string): string {
  const withBreaks = sanitised
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote|pre|dd|dt|table)>/gi, '\n')
    .replace(/<(br|hr)>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<\/(td|th)>/gi, '\t')
  return decodeEntities(withBreaks.replace(/<[^>]*>/g, ''))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ---------- the shape mail-ingest accepts ----------

export interface ParsedAttachment {
  name: string
  size: number
  type: string
}

export interface NormalisedMessage {
  from_email: string
  from_header: string
  to_email: string
  subject: string
  subject_key: string
  message_id: string | null
  in_reply_to: string | null
  reference_ids: string[]
  body_text: string
  body_html: string | null
  truncated: boolean
  attachments: ParsedAttachment[]
  auth_results: string | null
  dedupe_hash: string
}

// Turns whatever the Worker POSTed into exactly the row the table accepts, or
// null when there is not enough of a message left to be worth storing.
//
// Every field is derived here rather than in the handler so that the rules live
// in one testable place, and so a future second producer (a different mail
// route, a backfill) cannot arrive with its own idea of what a message is.
export async function normaliseInbound(
  raw: Record<string, unknown>,
): Promise<NormalisedMessage | null> {
  // The envelope sender is what the receiving MTA actually routed on, so it is
  // preferred over the From: header, which is free text. Neither is proof of
  // anything; this is the better of two guesses and it is used only as a
  // grouping key and a reply address.
  const from_email = normaliseEmail(raw.envelope_from) || normaliseEmail(raw.from)
  const to_email = normaliseEmail(raw.envelope_to) || normaliseEmail(raw.to)
  if (!from_email || !to_email) return null

  const subject = displaySubject(typeof raw.subject === 'string' ? raw.subject : '')

  const rawHtml = typeof raw.html === 'string' ? raw.html : ''
  const sanitised = rawHtml ? sanitiseHtml(rawHtml) : ''
  const body_html = sanitised || null

  const rawText = typeof raw.text === 'string' ? cleanBody(raw.text) : ''
  // An HTML-only message still has to be readable, and readable WITHOUT
  // rendering the markup — so the text is derived from the sanitised html
  // rather than from the original.
  const derived = rawText || (body_html ? htmlToText(body_html) : '')
  const truncated = derived.length > MAX_BODY_TEXT || rawHtml.length > MAX_BODY_HTML
  const body_text = derived.slice(0, MAX_BODY_TEXT)

  if (!body_text && !body_html) return null

  const references = Array.isArray(raw.references) ? raw.references : []

  const attachments: ParsedAttachment[] = (Array.isArray(raw.attachments) ? raw.attachments : [])
    .slice(0, MAX_ATTACHMENTS)
    .map((a): ParsedAttachment => {
      const at = (a ?? {}) as Record<string, unknown>
      return {
        name: cleanHeader(at.name, MAX_ATTACHMENT_NAME) || '(unnamed)',
        size: typeof at.size === 'number' && Number.isFinite(at.size) && at.size >= 0
          ? Math.floor(at.size)
          : 0,
        type: cleanHeader(at.type, 100) || 'application/octet-stream',
      }
    })

  const message_id = cleanHeader(raw.message_id, MAX_HEADER_ID) || null

  return {
    from_email,
    from_header: cleanHeader(raw.from, MAX_EMAIL + 100),
    to_email,
    subject,
    subject_key: normaliseSubject(subject),
    message_id,
    in_reply_to: cleanHeader(raw.in_reply_to, MAX_HEADER_ID) || null,
    reference_ids: references
      .slice(0, MAX_REFERENCES)
      .map((r) => cleanHeader(r, MAX_HEADER_ID))
      .filter((r): r is string => r.length > 0),
    body_text,
    body_html,
    truncated,
    attachments,
    auth_results: cleanHeader(raw.auth_results, MAX_AUTH_RESULTS) || null,
    dedupe_hash: await dedupeHash({
      messageId: message_id ?? undefined,
      from: from_email,
      to: to_email,
      subject,
      body: body_text,
    }),
  }
}
