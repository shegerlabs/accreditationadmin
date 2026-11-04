import { EmailClient, KnownEmailSendStatus } from '@azure/communication-email'
import { getSetting, SettingKeys } from './settings.server'

export async function sendEmailAzure(options: {
	to: string
	subject: string
	plainText: string
	html?: string
}) {
	const { to, subject, plainText, html } = options

	// Get email settings
	const [senderAddress, sendTimeoutSeconds] = await Promise.all([
		getSetting<string>(SettingKeys.EMAIL_SENDER_ADDRESS),
		getSetting<number>(SettingKeys.EMAIL_SEND_TIMEOUT_SECONDS),
	])

	const POLLER_WAIT_TIME = 10
	const message = {
		senderAddress,
		recipients: {
			to: [{ address: to }],
		},
		content: {
			subject,
			plainText,
			html,
		},
	}

	try {
		const client = new EmailClient(process.env.EMAIL_CONNECTION_STRING || '')
		const poller = await client.beginSend(message)

		if (!poller.getOperationState().isStarted) {
			throw 'Poller was not started.'
		}

		let timeElapsed = 0
		while (!poller.isDone()) {
			poller.poll()

			await new Promise(resolve => setTimeout(resolve, POLLER_WAIT_TIME * 1000))
			timeElapsed += POLLER_WAIT_TIME

			if (timeElapsed > sendTimeoutSeconds) {
				throw 'Polling timed out.'
			}
		}

		if (poller.getResult()?.status === KnownEmailSendStatus.Succeeded) {
			return { status: 'success' } as const
		} else {
			return { status: 'error', error: poller.getResult()?.error } as const
		}
	} catch (error) {
		return { status: 'error', error } as const
	}
}
