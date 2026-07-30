const CONTROL_CHARS = new RegExp('[\\u0000-\\u001F\\u007F]', 'g')

// One-line values: names, subjects, addresses, notes. Every control character
// goes, including newlines — in a subject or an address a newline is not
// formatting, it is how one header becomes two.
export function sanitizeText(input: unknown, maxLength: number): string {
  if (typeof input !== 'string') return ''
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/[<>]/g, '')
    .replace(CONTROL_CHARS, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, maxLength)
}

// Everything except tab and newline, which in a message body ARE the content.
const CONTROL_CHARS_KEEPING_BREAKS = new RegExp(
  '[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]',
  'g',
)

// The body of an email being sent, which is the one field where sanitizeText is
// actively wrong: it strips newlines as control characters and then collapses
// runs of whitespace, so a letter with paragraphs went out as a single run-on
// line. Every message sent from /admin was flattened that way.
//
// Line breaks are kept, and so are '<' and '>'. Stripping those was belt and
// braces that cost correctness — you could not write "if x < 5" — and bought
// nothing: sendAsSupport escapes the body before it goes into the HTML part,
// the text/plain part needs no escaping at all, and the admin page renders the
// stored copy as React text. The escaping is the defence; mangling the input
// was never the defence.
//
// Runaway blank lines are capped so a stray paste cannot turn into pages of
// nothing, and trailing spaces go because some mail clients render them as
// stray characters at a line end.
export function sanitizeMessageBody(input: unknown, maxLength: number): string {
  if (typeof input !== 'string') return ''
  return input
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_CHARS_KEEPING_BREAKS, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
    .slice(0, maxLength)
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && EMAIL_RE.test(email)
}
