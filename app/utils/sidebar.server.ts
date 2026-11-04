import * as cookie from 'cookie'

const cookieName = 'sidebar'
export type SidebarState = 'expanded' | 'collapsed'

export function getSidebarState(request: Request): SidebarState {
	const cookieHeader = request.headers.get('cookie')
	const parsed = cookieHeader ? cookie.parse(cookieHeader)[cookieName] : 'expanded'
	if (parsed === 'expanded' || parsed === 'collapsed') return parsed
	return 'expanded'
}

export function setSidebarState(state: SidebarState) {
	return cookie.serialize(cookieName, state, { path: '/' })
}
