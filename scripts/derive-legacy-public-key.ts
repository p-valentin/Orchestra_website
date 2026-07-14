// Derives LEGACY_SIGNING_KEY (the Ed25519 PUBLIC key) from the website's
// LICENSE_PRIVATE_KEY, so the Supabase functions can verify legacy license
// keys without ever holding the private key.
//
//   LICENSE_PRIVATE_KEY='<pem or base64-of-pem>' deno run scripts/derive-legacy-public-key.ts
//   (or: node scripts/derive-legacy-public-key.ts — reads the same env var)
//
// The value accepted matches lib/token.ts: a raw PKCS8 PEM or single-line
// base64 of one. Web Crypto only, so it runs under Deno and Node ≥ 20.

const subtle = globalThis.crypto.subtle

function getEnv(name: string): string | undefined {
  // deno-lint-ignore no-explicit-any
  const g = globalThis as any
  return g.Deno ? g.Deno.env.get(name) : g.process?.env?.[name]
}

function toPem(der: ArrayBuffer, label: string): string {
  const b64 = btoa(String.fromCharCode(...new Uint8Array(der)))
  const lines = b64.match(/.{1,64}/g) ?? []
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`
}

function pemToDer(pem: string): Uint8Array {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '')
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

const raw = getEnv('LICENSE_PRIVATE_KEY')
if (!raw) throw new Error('LICENSE_PRIVATE_KEY is not set (raw PEM or base64 of the PEM).')

const pem = raw.includes('BEGIN') ? raw : atob(raw.replace(/\s/g, ''))
const privateKey = await subtle.importKey('pkcs8', pemToDer(pem).buffer as ArrayBuffer, { name: 'Ed25519' }, true, ['sign'])

// An Ed25519 private JWK carries the public half in `x`; drop `d` and
// re-import to get a clean public key.
const jwk = (await subtle.exportKey('jwk', privateKey)) as Record<string, unknown>
delete jwk.d
jwk.key_ops = ['verify']
const publicKey = await subtle.importKey('jwk', jwk as JsonWebKey, { name: 'Ed25519' }, true, ['verify'])
const spki = await subtle.exportKey('spki', publicKey)
const publicPem = toPem(spki, 'PUBLIC KEY')

console.log('# Set as a Supabase secret:')
console.log('# supabase secrets set LEGACY_SIGNING_KEY=<value below>')
console.log()
console.log('LEGACY_SIGNING_KEY (base64 of SPKI PEM, single line):')
console.log(btoa(publicPem))
console.log()
console.log('Same key, PEM form (reference):')
console.log(publicPem)
