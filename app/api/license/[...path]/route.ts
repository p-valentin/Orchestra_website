import { type NextRequest } from 'next/server'

// The pre-Supabase licensing API — /api/license/register, /login, /refresh and
// /api/claim — is gone. It was a second, parallel account system backed by R2
// (scrypt password hashes in site/accounts/, grants in site/licenses/, claims
// in site/claims/), and nothing has called it since the app moved to Supabase:
// Orchestra 1.3.0 talks only to the entitlement Edge Function.
//
// This stub exists instead of a bare 404 for one reason: production runtime
// logs here are demonstrably incomplete — a 7-day and a 30-day window return
// identical counts, and /api/download never appears despite logging on every
// request — so "no evidence anyone still calls it" is not the same as proof.
// If some straggler on a 0.9.x build is still out there, it gets a deliberate,
// documented 410 and a line in the log naming itself, rather than a mystery.
//
// Legacy license KEYS are unaffected: they are Ed25519 tokens redeemed by the
// claim-legacy Edge Function, which verifies the signature in Supabase and
// never read any of this. Reproducing one still works via scripts/seed-legacy.ts.
//
// Safe to delete outright once the log below has stayed silent for a while.

function gone(request: NextRequest, path: string): Response {
  console.log(JSON.stringify({
    event: 'legacy_license_api_hit',
    path,
    userAgent: request.headers.get('user-agent') ?? 'unknown',
    timestamp: new Date().toISOString(),
  }))
  return Response.json(
    {
      ok: false,
      error: 'endpoint-removed',
      message:
        'This licensing endpoint has been retired. Please update to the latest version of Orchestra from https://www.orchestra-automation.com/downloads — your license still works.',
    },
    { status: 410 },
  )
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  return gone(request, `/api/license/${path.join('/')}`)
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  return gone(request, `/api/license/${path.join('/')}`)
}
