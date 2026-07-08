import crypto from 'crypto'

// RFC 6238 TOTP (the standard authenticator-app algorithm: HMAC-SHA1, 30 s
// steps, 6 digits) with ±1 step of clock tolerance. Node crypto only — no
// dependency. The admin's secret lives in env ADMIN_TOTP_SECRET as base32
// (the alphabet authenticator apps expect); unset means 2FA is off.

const STEP_SECONDS = 30
const DIGITS = 6

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function base32Decode(input: string): Buffer | null {
  const clean = input.toUpperCase().replace(/[\s=]/g, '')
  if (!clean || /[^A-Z2-7]/.test(clean)) return null
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const char of clean) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(char)
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

function hotp(secret: Buffer, counter: number): string {
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(counter))
  const mac = crypto.createHmac('sha1', secret).update(msg).digest()
  const offset = mac[mac.length - 1]! & 0x0f
  const code = (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS
  return String(code).padStart(DIGITS, '0')
}

export function totpEnabled(): boolean {
  const raw = process.env.ADMIN_TOTP_SECRET
  return Boolean(raw && base32Decode(raw))
}

// True when the code matches the current step or its immediate neighbours
// (allows for clock skew and typing near a step boundary).
export function verifyTotp(code: string): boolean {
  const raw = process.env.ADMIN_TOTP_SECRET
  if (!raw) return false
  const secret = base32Decode(raw)
  if (!secret) return false
  const given = code.trim()
  if (!new RegExp(`^\\d{${DIGITS}}$`).test(given)) return false
  const step = Math.floor(Date.now() / 1000 / STEP_SECONDS)
  return [step - 1, step, step + 1].some(counter => {
    const expected = hotp(secret, counter)
    return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))
  })
}
