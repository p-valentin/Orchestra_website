// Request/response plumbing shared by all Edge Functions.

import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2'

// The website's /account page calls the devices function from the browser, so
// responses need CORS headers. A wildcard origin is safe here: auth is a
// bearer JWT (never cookies), so no credentialed cross-site request exists to
// protect against.
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

// Preflight response for browser callers; functions return it for OPTIONS.
export function preflight(): Response {
  return new Response(null, { status: 204, headers: corsHeaders })
}

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

export function errorResponse(status: number, code: string, extra: Record<string, unknown> = {}): Response {
  return json(status, { error: code, ...extra })
}

// Service-role client: bypasses RLS. All license-table writes go through this;
// clients only ever get RLS-scoped reads.
export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )
}

// Resolves the caller from their Supabase Auth JWT. Returns null on any
// missing/invalid credential — callers turn that into a 401.
export async function authenticateRequest(req: Request, supabase: SupabaseClient): Promise<User | null> {
  const header = req.headers.get('Authorization') ?? ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  if (!match) return null
  const { data, error } = await supabase.auth.getUser(match[1])
  if (error || !data.user) return null
  return data.user
}

// Body parsing that never throws: bad JSON becomes null, which handlers map
// to a 400.
export async function readJsonBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json()
    return body !== null && typeof body === 'object' && !Array.isArray(body) ? body : null
  } catch {
    return null
  }
}
