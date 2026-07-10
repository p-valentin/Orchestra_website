import fs from 'fs'
import path from 'path'
import { AwsClient } from 'aws4fetch'

// Admin data lives in a PRIVATE R2 bucket (never the public downloads one).
// Without R2 credentials it falls back to .data/ on disk, which works for
// local dev but not on Vercel's read-only filesystem.

const LOCAL_DIR = path.join(process.cwd(), '.data')

function r2Config() {
  const { R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env
  if (!R2_ENDPOINT || !R2_BUCKET || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) return null
  return {
    url: `${R2_ENDPOINT.replace(/\/$/, '')}/${R2_BUCKET}`,
    client: new AwsClient({
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
      region: 'auto',
      service: 's3',
    }),
  }
}

export function storageMode(): 'r2' | 'local' {
  return r2Config() ? 'r2' : 'local'
}

export async function readJson<T>(key: string, fallback: T): Promise<T> {
  const r2 = r2Config()
  if (r2) {
    try {
      const res = await r2.client.fetch(`${r2.url}/${key}`)
      if (res.status === 404) return fallback
      if (!res.ok) throw new Error(`R2 read ${key}: ${res.status}`)
      return (await res.json()) as T
    } catch (err) {
      console.error('[store] read failed:', (err as Error).message)
      return fallback
    }
  }
  try {
    return JSON.parse(fs.readFileSync(path.join(LOCAL_DIR, key), 'utf-8')) as T
  } catch {
    return fallback
  }
}

// Lists object keys under a prefix (e.g. 'site/claims/'). R2 uses S3
// ListObjectsV2 with continuation; local mode walks the directory. Errors
// return [] so callers degrade the same way readJson does.
export async function listKeys(prefix: string): Promise<string[]> {
  const r2 = r2Config()
  if (r2) {
    const keys: string[] = []
    let continuation: string | null = null
    try {
      do {
        const params = new URLSearchParams({ 'list-type': '2', prefix })
        if (continuation) params.set('continuation-token', continuation)
        const res = await r2.client.fetch(`${r2.url}?${params}`)
        if (!res.ok) throw new Error(`R2 list ${prefix}: ${res.status}`)
        const xml = await res.text()
        for (const match of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) keys.push(match[1]!)
        const token = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)
        continuation = token ? token[1]! : null
      } while (continuation)
      return keys
    } catch (err) {
      console.error('[store] list failed:', (err as Error).message)
      return []
    }
  }
  try {
    const dir = path.join(LOCAL_DIR, prefix)
    return fs.readdirSync(dir).map(name => `${prefix}${name}`)
  } catch {
    return []
  }
}

export async function writeJson(key: string, data: unknown): Promise<boolean> {
  const body = JSON.stringify(data)
  const r2 = r2Config()
  if (r2) {
    try {
      const res = await r2.client.fetch(`${r2.url}/${key}`, {
        method: 'PUT',
        body,
        headers: { 'content-type': 'application/json' },
      })
      if (!res.ok) throw new Error(`R2 write ${key}: ${res.status}`)
      return true
    } catch (err) {
      console.error('[store] write failed:', (err as Error).message)
      return false
    }
  }
  try {
    fs.mkdirSync(path.dirname(path.join(LOCAL_DIR, key)), { recursive: true })
    fs.writeFileSync(path.join(LOCAL_DIR, key), body)
    return true
  } catch (err) {
    console.error('[store] write failed:', (err as Error).message)
    return false
  }
}

// Deleting an already-absent key succeeds — callers only care that it's gone.
export async function deleteKey(key: string): Promise<boolean> {
  const r2 = r2Config()
  if (r2) {
    try {
      const res = await r2.client.fetch(`${r2.url}/${key}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 404) throw new Error(`R2 delete ${key}: ${res.status}`)
      return true
    } catch (err) {
      console.error('[store] delete failed:', (err as Error).message)
      return false
    }
  }
  try {
    fs.unlinkSync(path.join(LOCAL_DIR, key))
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'ENOENT'
  }
}
