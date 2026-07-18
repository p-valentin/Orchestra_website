// Generates the Ed25519 keypair for entitlement token signing.
//
//   deno run scripts/generate-keys.ts      (or: node scripts/generate-keys.ts)
//
// Prints:
//   - ENTITLEMENT_PRIVATE_KEY  → Supabase secret (base64 of the PKCS8 PEM,
//     single line; the functions accept raw PEM too)
//   - public key JWK           → embedded in the desktop client (Phase 3)
//   - public key SPKI PEM      → same key, PEM form, for reference
//
// Web Crypto only, so it runs identically under Deno and Node ≥ 20.

const subtle = globalThis.crypto.subtle

function toPem(der: ArrayBuffer, label: string): string {
  const b64 = btoa(String.fromCharCode(...new Uint8Array(der)))
  const lines = b64.match(/.{1,64}/g) ?? []
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`
}

const pair = (await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair
const pkcs8 = await subtle.exportKey('pkcs8', pair.privateKey)
const spki = await subtle.exportKey('spki', pair.publicKey)
const jwk = await subtle.exportKey('jwk', pair.publicKey)
delete (jwk as Record<string, unknown>).key_ops
delete (jwk as Record<string, unknown>).ext

const privatePem = toPem(pkcs8, 'PRIVATE KEY')

console.log('# Set as a Supabase secret:')
console.log(`# supabase secrets set ENTITLEMENT_PRIVATE_KEY=<value below>`)
console.log()
console.log('ENTITLEMENT_PRIVATE_KEY (base64 of PKCS8 PEM, single line):')
console.log(btoa(privatePem))
console.log()
console.log('Public key JWK (embed in the desktop client, Phase 3):')
console.log(JSON.stringify(jwk, null, 2))
console.log()
console.log('Public key SPKI PEM (reference):')
console.log(toPem(spki, 'PUBLIC KEY'))
