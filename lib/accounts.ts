import crypto from 'crypto'
import { promisify } from 'util'
import { readJson, writeJson } from './store'

// User accounts for the desktop app's sign-in. One record per account keyed by
// a hash of the email, mirroring claims.ts, so writes never collide. Passwords
// are scrypt-hashed with a per-account salt — never stored or logged raw.

const scrypt = promisify(crypto.scrypt) as (password: string, salt: string, keylen: number) => Promise<Buffer>

export const MIN_PASSWORD_LENGTH = 8

export interface AccountRecord {
  email: string
  passwordHash: string // scrypt-64, hex
  salt: string // 16 random bytes, hex
  createdAt: number
}

function keyFor(email: string): string {
  const hash = crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex')
  return `site/accounts/${hash}.json`
}

export async function getAccount(email: string): Promise<AccountRecord | null> {
  return readJson<AccountRecord | null>(keyFor(email), null)
}

export async function createAccount(
  email: string,
  password: string,
): Promise<{ ok: true; record: AccountRecord } | { ok: false; reason: 'exists' | 'store-failed' }> {
  const existing = await getAccount(email)
  if (existing) return { ok: false, reason: 'exists' }
  const salt = crypto.randomBytes(16).toString('hex')
  const passwordHash = (await scrypt(password, salt, 64)).toString('hex')
  const record: AccountRecord = { email: email.toLowerCase().trim(), passwordHash, salt, createdAt: Date.now() }
  const stored = await writeJson(keyFor(email), record)
  if (!stored) return { ok: false, reason: 'store-failed' }
  return { ok: true, record }
}

export async function verifyPassword(record: AccountRecord, password: string): Promise<boolean> {
  try {
    const hash = await scrypt(password, record.salt, 64)
    const stored = Buffer.from(record.passwordHash, 'hex')
    return stored.length === hash.length && crypto.timingSafeEqual(hash, stored)
  } catch {
    return false
  }
}
