'use client'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Browser-side Supabase client for the account pages (signup, login, account,
// password reset). Only the anon key is ever exposed here — it is public by
// design and every table is guarded by RLS; the licensing writes all happen
// in Edge Functions with the service role.
//
// These pages exist because the desktop app deliberately stays sign-in only:
// registration and password reset need a browser (email confirmation links
// have to land somewhere), and /account gives people a place to see their
// license and manage device slots without opening the app.

let cached: SupabaseClient | null = null

export function supabaseBrowser(): SupabaseClient {
  if (cached) return cached
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error('Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).')
  }
  cached = createClient(url, anonKey, {
    auth: {
      // Sessions persist so /account and the nav know who's signed in across
      // visits. The tradeoff (tokens in localStorage on a shared browser) is
      // the standard one for any site with a login; Sign out clears it.
      persistSession: true,
      // Recovery/confirmation links arrive as a hash fragment; supabase-js
      // parses it into a session so updateUser() can run.
      detectSessionInUrl: true,
    },
  })
  return cached
}

// Where Supabase should send people back to after they click an emailed link.
// Uses the live origin so previews and localhost work without config.
export function authRedirectTo(path: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://orchestra-automation.com'
  return `${origin}${path}`
}
