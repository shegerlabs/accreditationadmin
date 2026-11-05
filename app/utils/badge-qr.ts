// Badge QR codes hold a URL like https://host/printer/requests/{participantId}?v=2.
// v is the participant's badgeVersion when the badge was printed. Badges printed
// before versioning have no v and count as version 1.

export function badgeQrUrl(
	baseUrl: string,
	path: 'requests' | 'reprints',
	participant: { id: string; badgeVersion: number },
) {
	return `${baseUrl}/printer/${path}/${participant.id}?v=${participant.badgeVersion}`
}

/**
 * `version` is null when the scan is a raw participant ID or registration code
 * (typed in, or picked from search), which says nothing about which badge it is.
 */
export function parseBadgeQr(data: string) {
	let parsed: URL
	try {
		parsed = new URL(data)
	} catch {
		const id = data.trim()
		return id ? { id, version: null } : null
	}
	// Reprinted badges have pointed at /printer/reprints/ as well as /printer/requests/.
	const match = parsed.pathname.match(/\/(?:requests|reprints)\/([^/]+)$/)
	if (!match) return null
	const v = Number(parsed.searchParams.get('v'))
	return { id: match[1], version: Number.isInteger(v) && v >= 1 ? v : 1 }
}

export function getRevokedBadgeError(
	participant: {
		badgeVersion: number
		badgeRevokedAt: Date | null
		badgeRevokedReason: string | null
	},
	scannedVersion: number | null,
) {
	if (scannedVersion === null || scannedVersion >= participant.badgeVersion) {
		return null
	}
	const reason = participant.badgeRevokedReason
		? `: ${participant.badgeRevokedReason}`
		: ''
	return `Badge revoked${reason}. Only the replacement badge is valid.`
}
