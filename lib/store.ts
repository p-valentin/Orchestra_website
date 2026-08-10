import fs from 'fs'
import path from 'path'
import { cache } from 'react'
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
  return (await readJsonChecked(key, fallback)) ?? fallback
}

// Per-request memoized read, for pages that ask for the same object more than
// once while rendering. React's cache() dedupes within a single request and
// nothing beyond it, so this stays correct across deploys and users.
//
// DO NOT use this in a read-modify-write path. Those callers must see the
// current object on every read; handing one a memoized copy is how two edits in
// the same request end up with the second silently clobbering the first.
// readJsonChecked is the one to use there, and it is deliberately not cached.
const readJsonMemo = cache(async (key: string): Promise<unknown> => await readJsonChecked<unknown>(key, null))

export async function readJsonCached<T>(key: string, fallback: T): Promise<T> {
  return ((await readJsonMemo(key)) as T | null) ?? fallback
}

// Like readJson, but only a genuinely missing key yields `missing`; any other
// failure returns null. Read-modify-write callers must use this: through
// readJson a transient read error looks like an empty store, and writing the
// "updated" result back would clobber every record the read never saw.
export async function readJsonChecked<T>(key: string, missing: T): Promise<T | null> {
  const r2 = r2Config()
  if (r2) {
    try {
      const res = await r2.client.fetch(`${r2.url}/${key}`)
      if (res.status === 404) return missing
      if (!res.ok) throw new Error(`R2 read ${key}: ${res.status}`)
      return (await res.json()) as T
    } catch (err) {
      console.error('[store] read failed:', (err as Error).message)
      return null
    }
  }
  try {
    return JSON.parse(fs.readFileSync(path.join(LOCAL_DIR, key), 'utf-8')) as T
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return missing
    console.error('[store] read failed:', (err as Error).message)
    return null
  }
}

// Read-modify-write that cannot lose a concurrent update.
//
// The naive version — read, mutate, write — has two failure modes, and this
// store has been bitten by both:
//
//   1. a failed READ that looks like an empty store, so the write replaces
//      everything. readJsonChecked closes that one: null means "don't write".
//   2. two writers reading the same version and both writing back, so whichever
//      lands second silently discards the other's increment. On a page counter
//      under any burst at all, that is most of the traffic.
//
// The fix for (2) is a conditional PUT. R2 honours If-Match, so the write only
// lands if the object is still the version we read; If-None-Match: * covers the
// first write, when there is nothing there yet. A 412 means somebody beat us,
// so we re-read and reapply rather than overwrite them.
//
// `mutate` must be pure enough to run more than once — it is handed a fresh
// copy of the current state on every attempt.
//
// Local mode does the plain read-modify-write: one process, no concurrency to
// lose anything to.
export async function updateJson<T>(
  key: string,
  missing: T,
  mutate: (current: T) => void,
  attempts = 5,
): Promise<boolean> {
  const r2 = r2Config()

  if (!r2) {
    const current = await readJsonChecked<T>(key, missing)
    if (current === null) return false
    mutate(current)
    return writeJson(key, current)
  }

  for (let attempt = 0; attempt < attempts; attempt++) {
    let current: T
    let etag: string | null
    try {
      const res = await r2.client.fetch(`${r2.url}/${key}`)
      if (res.status === 404) {
        current = missing
        etag = null
      } else if (res.ok) {
        current = (await res.json()) as T
        etag = res.headers.get('etag')
      } else {
        throw new Error(`R2 read ${key}: ${res.status}`)
      }
    } catch (err) {
      console.error('[store] update read failed:', (err as Error).message)
      return false
    }

    mutate(current)

    try {
      const body = encodeBody(current)
      const res = await r2.client.fetch(`${r2.url}/${key}`, {
        method: 'PUT',
        body,
        headers: {
          'content-type': 'application/json',
          'content-length': String(body.byteLength),
          // Exactly one of these: match the version we read, or require that
          // nothing exists yet.
          ...(etag ? { 'if-match': etag } : { 'if-none-match': '*' }),
        },
        cache: 'no-store',
      })
      if (res.ok) return true
      // 412 (and 409, which R2 can return for a racing create) mean another
      // writer got there first. Re-read and reapply.
      if (res.status === 412 || res.status === 409) {
        // Small jittered backoff so simultaneous writers don't lockstep.
        await new Promise(resolve => setTimeout(resolve, 15 + Math.random() * 60))
        continue
      }
      throw new Error(`R2 conditional write ${key}: ${res.status}`)
    } catch (err) {
      console.error('[store] update write failed:', (err as Error).message)
      return false
    }
  }

  console.error(`[store] update gave up on ${key} after ${attempts} attempts`)
  return false
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

// R2 refuses a chunked PUT with 411 Length Required, and a plain string body
// does not reliably survive the Vercel/Next fetch stack with its Content-Length
// intact — somewhere in there it becomes a stream and undici falls back to
// Transfer-Encoding: chunked. Encoding to bytes up front makes the length
// knowable, so it can be sent explicitly and stay correct for multi-byte
// characters. cache: 'no-store' keeps Next's patched fetch off the caching path,
// which is what reconstructs the request in the first place. Observed as every
// admin save failing in production while reads were fine.
function encodeBody(data: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(data))
}

export async function writeJson(key: string, data: unknown): Promise<boolean> {
  const body = encodeBody(data)
  const r2 = r2Config()
  if (r2) {
    try {
      const res = await r2.client.fetch(`${r2.url}/${key}`, {
        method: 'PUT',
        body,
        headers: {
          'content-type': 'application/json',
          'content-length': String(body.byteLength),
        },
        cache: 'no-store',
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
