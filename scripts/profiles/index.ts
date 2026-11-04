// profiles/index.ts
// The organ registry. Add a new organ by creating a profile module and
// listing it here — `setup-event` needs no change.

import { acerwc } from './acerwc.js'
import { auc } from './auc.js'
import { type OrganProfile } from './types.js'

export const PROFILES: OrganProfile[] = [auc, acerwc]

export function findProfile(key: string): OrganProfile | undefined {
	return PROFILES.find(p => p.key === key.toLowerCase())
}

export * from './types.js'
