const CONTROL_CHARS = new RegExp('[\\u0000-\\u001F\\u007F]', 'g')

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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && EMAIL_RE.test(email)
}
