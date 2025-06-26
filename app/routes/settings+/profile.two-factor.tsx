import { Outlet } from '@remix-run/react'
import { Icon } from '~/components/ui/icon'

export const handle = {
	breadcrumb: <Icon name="lock-closed">2FA</Icon>,
}

export default function TwoFactorRoute() {
	return <Outlet />
}
