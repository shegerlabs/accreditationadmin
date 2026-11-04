import { parseWithZod } from '@conform-to/zod'
import { ActionFunctionArgs, json } from '@remix-run/node'
import { z } from 'zod'
import { requireUserWithRoles } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import {
	DefaultSettings,
	SettingKey,
	updateSetting,
} from '~/utils/settings.server'
import { redirectWithToast } from '~/utils/toast.server'

const UpdateSettingSchema = z.object({
	key: z.string(),
	value: z.string(),
	type: z.enum(['STRING', 'NUMBER', 'BOOLEAN', 'JSON']),
})

export async function handleSettingsAction(request: Request, category: string) {
	await requireUserWithRoles(request, ['admin'])

	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const intent = formData.get('intent')

	if (intent === 'reset') {
		const key = formData.get('key') as string
		const defaultSetting = DefaultSettings[key as SettingKey]
		if (defaultSetting) {
			await updateSetting(key as SettingKey, defaultSetting.value)
		}
		return json({ success: true })
	}

	const submission = parseWithZod(formData, {
		schema: UpdateSettingSchema,
	})

	if (submission.status !== 'success') {
		return json(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 }
		)
	}

	const { key, value, type } = submission.value

	// Parse value based on type
	let parsedValue: unknown = value
	if (type === 'NUMBER') {
		parsedValue = Number(value)
		if (isNaN(parsedValue as number)) {
			return json(
				{ result: submission.reply({ formErrors: ['Invalid number'] }) },
				{ status: 400 }
			)
		}
	} else if (type === 'BOOLEAN') {
		parsedValue = value === 'true' || value === 'on'
	} else if (type === 'JSON') {
		try {
			parsedValue = JSON.parse(value)
		} catch {
			return json(
				{ result: submission.reply({ formErrors: ['Invalid JSON'] }) },
				{ status: 400 }
			)
		}
	}

	await updateSetting(key as SettingKey, parsedValue)

	return redirectWithToast(`/admin/settings/${category}`, {
		type: 'success',
		title: 'Setting Updated',
		description: 'The setting has been saved successfully.',
	})
}
