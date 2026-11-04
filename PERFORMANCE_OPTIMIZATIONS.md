# Production Performance Optimizations

This document details all changes made for production performance optimizations.

---

## 1. Database Indexes

**File:** `prisma/schema.prisma`

### Workflow Model (line 516)
```prisma
@@index([tenantId])
```

### Step Model (lines 545-547)
```prisma
@@index([workflowId, action])
@@index([workflowId, isBypassTarget])
@@index([workflowId, isRejectionTarget])
```

### Participant Model (lines 689-691)
```prisma
@@index([eventId, stepId, status])
@@index([tenantId, eventId, participantTypeId])
@@index([status, createdAt])
```

### Approval Model (lines 722-724)
```prisma
@@index([participantId, createdAt])
@@index([userId, createdAt])
@@index([stepId])
```

**Purpose:** Improve query performance for common access patterns like filtering participants by event/step/status, looking up approvals by participant, and workflow step lookups.

---

## 2. Query Logging Configuration

### File: `app/utils/env.server.ts`

**Added environment variable definitions:**
```typescript
QUERY_LOG_ENABLED: z.enum(['true', 'false']).optional(),
QUERY_LOG_THRESHOLD: z.string().optional(),
```

### File: `app/utils/db.server.ts`

**Changed from:**
```typescript
const prisma = remember('prisma', () => {
  const logThreshold = 20

  const client = new PrismaClient({
    log: [
      { level: 'query', emit: 'event' },
      { level: 'error', emit: 'stdout' },
      { level: 'warn', emit: 'stdout' },
    ],
  })
  client.$on('query', async e => {
    if (e.duration < logThreshold) return
    // ... color logging logic
  })
  client.$connect()
  return client
})
```

**Changed to:**
```typescript
const prisma = remember('prisma', () => {
  const isProduction = process.env.NODE_ENV === 'production'
  const queryLogEnabled = process.env.QUERY_LOG_ENABLED !== 'false'
  const logThreshold = process.env.QUERY_LOG_THRESHOLD
    ? parseInt(process.env.QUERY_LOG_THRESHOLD, 10)
    : isProduction
      ? 100
      : 20

  const client = new PrismaClient({
    log: queryLogEnabled
      ? [
          { level: 'query', emit: 'event' },
          { level: 'error', emit: 'stdout' },
          { level: 'warn', emit: 'stdout' },
        ]
      : [
          { level: 'error', emit: 'stdout' },
          { level: 'warn', emit: 'stdout' },
        ],
  })

  if (queryLogEnabled) {
    client.$on('query', async e => {
      if (e.duration < logThreshold) return
      // ... color logging logic
    })
  }

  client.$connect()
  return client
})
```

**Purpose:**
- Allow disabling query logging in production with `QUERY_LOG_ENABLED=false`
- Configurable threshold (default: 20ms dev, 100ms production)
- Reduces log noise and improves performance when logging is disabled

---

## 3. Rate Limiting Fix

**File:** `server.js` (lines 149-157)

**Changed from:**
```javascript
app.use((req, res, next) => {
  const strongPaths = []

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (strongPaths.some(path => req.path.includes(path))) {
      return strongestRateLimit(req, res, next)
    }
    return strongRateLimit(req, res, next)
  }
  return generalRateLimit(req, res, next)
})
```

**Changed to:**
```javascript
app.use((req, res, next) => {
  const strongPaths = [
    '/login',
    '/signup',
    '/forgot-password',
    '/reset-password',
    '/verify',
    '/onboarding',
  ]

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (strongPaths.some(path => req.path.includes(path))) {
      return strongestRateLimit(req, res, next)
    }
    return strongRateLimit(req, res, next)
  }
  return generalRateLimit(req, res, next)
})
```

**Purpose:** Apply strictest rate limiting (10 req/min) to sensitive authentication endpoints to prevent brute-force attacks. Previously these endpoints got 50 req/min like all other mutations.

---

## 4. Reference Data Caching

### New File: `app/utils/cache.server.ts`

```typescript
import { remember } from '@epic-web/remember'
import { prisma } from './db.server'

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes in milliseconds

type CacheEntry<T> = {
  data: T
  timestamp: number
}

type CacheStore = {
  countries?: CacheEntry<Awaited<ReturnType<typeof fetchCountries>>>
  roles?: CacheEntry<Awaited<ReturnType<typeof fetchRoles>>>
}

const cache = remember('referenceDataCache', () => {
  return {} as CacheStore
})

function isExpired(timestamp: number): boolean {
  return Date.now() - timestamp > CACHE_TTL
}

async function fetchCountries() {
  return prisma.country.findMany({
    select: {
      id: true,
      name: true,
      code: true,
    },
    orderBy: { name: 'asc' },
  })
}

async function fetchRoles() {
  return prisma.role.findMany({
    select: {
      id: true,
      name: true,
      scope: true,
      description: true,
    },
    orderBy: { name: 'asc' },
  })
}

export async function getCachedCountries() {
  if (cache.countries && !isExpired(cache.countries.timestamp)) {
    return cache.countries.data
  }

  const data = await fetchCountries()
  cache.countries = { data, timestamp: Date.now() }
  return data
}

export async function getCachedRoles() {
  if (cache.roles && !isExpired(cache.roles.timestamp)) {
    return cache.roles.data
  }

  const data = await fetchRoles()
  cache.roles = { data, timestamp: Date.now() }
  return data
}

export function invalidateCache(key: keyof CacheStore) {
  delete cache[key]
}

export function invalidateAllCache() {
  cache.countries = undefined
  cache.roles = undefined
}
```

**Purpose:** Cache frequently-accessed reference data (countries, roles) for 5 minutes to reduce database queries. Uses `@epic-web/remember` for persistence across hot reloads in development.

---

## 5. Updated Loaders to Use Caching

### File: `app/routes/admin+/participants.tsx`

**Added import:**
```typescript
import { getCachedCountries } from '~/utils/cache.server'
```

**Changed from:**
```typescript
const countries = await prisma.country.findMany({
  select: {
    id: true,
    name: true,
  },
})
```

**Changed to:**
```typescript
const countries = await getCachedCountries()
```

---

### File: `app/routes/admin+/participants+/index.tsx`

**Added import:**
```typescript
import { getCachedCountries } from '~/utils/cache.server'
```

**Changed from:**
```typescript
// Countries are global data - no tenant filter needed
const countries = await prisma.country.findMany({
  select: {
    id: true,
    name: true,
  },
})
```

**Changed to:**
```typescript
// Countries are global data - use cached version
const countries = await getCachedCountries()
```

---

### File: `app/routes/validator+/requests.tsx`

**Added import:**
```typescript
import { getCachedCountries } from '~/utils/cache.server'
```

**Changed from:**
```typescript
const countries = await prisma.country.findMany({
  select: {
    id: true,
    name: true,
  },
})
```

**Changed to:**
```typescript
const countries = await getCachedCountries()
```

---

## 6. Cache Invalidation in Mutations

### File: `app/routes/admin+/countries+/__country-editor.server.tsx`

**Added import:**
```typescript
import { invalidateCache } from '~/utils/cache.server'
```

**Added after country delete (line 52):**
```typescript
invalidateCache('countries')
```

**Added after country create/update (line 124):**
```typescript
invalidateCache('countries')
```

---

### File: `app/routes/admin+/roles+/__role-editor.server.tsx`

**Added import:**
```typescript
import { invalidateCache } from '~/utils/cache.server'
```

**Added after role delete (line 50):**
```typescript
invalidateCache('roles')
```

**Added after role create/update (line 117):**
```typescript
invalidateCache('roles')
```

---

## Summary of Files Modified

| File | Type of Change |
|------|----------------|
| `prisma/schema.prisma` | Added 10 database indexes |
| `app/utils/env.server.ts` | Added 2 new env var definitions |
| `app/utils/db.server.ts` | Made query logging configurable |
| `server.js` | Populated strongPaths for rate limiting |
| `app/utils/cache.server.ts` | **New file** - caching utility |
| `app/routes/admin+/participants.tsx` | Use getCachedCountries |
| `app/routes/admin+/participants+/index.tsx` | Use getCachedCountries |
| `app/routes/validator+/requests.tsx` | Use getCachedCountries |
| `app/routes/admin+/countries+/__country-editor.server.tsx` | Add cache invalidation |
| `app/routes/admin+/roles+/__role-editor.server.tsx` | Add cache invalidation |

---

## Environment Variables

New optional environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `QUERY_LOG_ENABLED` | `true` | Set to `false` to disable query logging |
| `QUERY_LOG_THRESHOLD` | `20` (dev) / `100` (prod) | Minimum query duration (ms) to log |

---

## Verification Checklist

- [x] `npm run typecheck` - passes
- [x] `npm run build` - passes
- [x] `npx prisma db push` - indexes applied
- [ ] Manual test: Query logging disabled with `QUERY_LOG_ENABLED=false`
- [ ] Manual test: Rate limiting on auth endpoints (10 req/min)
- [ ] Manual test: Countries cached (no repeated queries)
- [ ] Manual test: Cache invalidates on country/role changes
