import { getGrant } from './licenseGrants'
import { getClaim } from './claims'
import { getAccount, type AccountRecord } from './accounts'

// What an email is entitled to, resolved across the three sources of truth:
//   1. a granted (paid) license — lib/licenseGrants.ts
//   2. a legacy free-window claim — lib/claims.ts (honored forever)
//   3. the 14-day trial that starts when the account is created
// Login and refresh both funnel through this so they can never disagree.

export const TRIAL_DAYS = 14
export const TRIAL_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000

export type Entitlement =
  | { plan: 'lifetime'; source: 'purchase' | 'claim' }
  | { plan: 'trial'; endsAt: number }
  | { plan: 'none'; reason: 'trial-expired' | 'no-account' }

export async function getEntitlement(email: string, account?: AccountRecord | null): Promise<Entitlement> {
  const grant = await getGrant(email)
  if (grant && grant.status === 'active') return { plan: 'lifetime', source: 'purchase' }

  const claim = await getClaim(email)
  if (claim) return { plan: 'lifetime', source: 'claim' }

  const acct = account !== undefined ? account : await getAccount(email)
  if (!acct) return { plan: 'none', reason: 'no-account' }
  const endsAt = acct.createdAt + TRIAL_MS
  if (Date.now() < endsAt) return { plan: 'trial', endsAt }
  return { plan: 'none', reason: 'trial-expired' }
}
