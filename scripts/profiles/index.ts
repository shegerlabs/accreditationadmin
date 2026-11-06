// profiles/index.ts
// The organ registry. This deployment serves the Pan-African Parliament only.
// Add a new organ by creating a profile module and listing it here —
// `setup-event` needs no change.

import { pap } from './pap.js'
import { type OrganProfile } from './types.js'

export const PROFILES: OrganProfile[] = [pap]

export function findProfile(key: string): OrganProfile | undefined {
	return PROFILES.find(p => p.key === key.toLowerCase())
}

export * from './types.js'
