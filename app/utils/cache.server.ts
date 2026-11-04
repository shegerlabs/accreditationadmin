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
	titles?: CacheEntry<Awaited<ReturnType<typeof fetchTitles>>>
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

async function fetchTitles() {
	return prisma.title.findMany({
		select: { id: true, name: true },
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

export async function getCachedTitles() {
	if (cache.titles && !isExpired(cache.titles.timestamp)) {
		return cache.titles.data
	}

	const data = await fetchTitles()
	cache.titles = { data, timestamp: Date.now() }
	return data
}

export function invalidateCache(key: keyof CacheStore) {
	delete cache[key]
}

export function invalidateAllCache() {
	cache.countries = undefined
	cache.roles = undefined
	cache.titles = undefined
}
