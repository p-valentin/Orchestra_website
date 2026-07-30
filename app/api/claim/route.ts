import { type NextRequest } from 'next/server'

// The free-window claim endpoint, retired alongside the rest of the
// pre-Supabase licensing stack. See app/api/license/[...path]/route.ts for why
// this answers 410 rather than simply not existing.
//
// People who already claimed keep their key: legacy tokens are Ed25519 and are
// redeemed by the claim-legacy Edge Function against Supabase, which never
// depended on this route or on anything it wrote to R2.

export async function POST(request: NextRequest) {
  console.log(JSON.stringify({
    event: 'legacy_license_api_hit',
    path: '/api/claim',
    userAgent: request.headers.get('user-agent') ?? 'unknown',
    timestamp: new Date().toISOString(),
  }))
  return Response.json(
    {
      ok: false,
      error: 'endpoint-removed',
      message:
        'The free-window claim has closed. Existing license keys still work — download the latest version at https://www.orchestra-automation.com/downloads.',
    },
    { status: 410 },
  )
}
