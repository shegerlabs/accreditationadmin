import { Form } from '@remix-run/react'
import React, { ReactNode, useState } from 'react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '~/components/ui/dialog'
import { StatusButton } from '~/components/ui/status-button'
import { useDoubleCheck, useIsPending } from '~/utils/misc'
import { Button } from './ui/button'

type ActionFormProps = {
	method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
	action?: string
	data?: { [key: string]: any }
	buttonContent: ReactNode
	buttonVariant?:
		| 'default'
		| 'destructive'
		| 'outline'
		| 'secondary'
		| 'ghost'
		| 'link'
	buttonSize?: 'default' | 'sm' | 'lg' | 'icon' | 'xs' | null | undefined
	additionalProps?: React.HTMLAttributes<HTMLFormElement>
	intent?: string
	showContentOnDoubleCheck?: boolean
	replacementContentOnDoubleCheck?: ReactNode
}

export function ActionForm({
	method = 'POST',
	action = '',
	data = {},
	buttonContent,
	buttonVariant = 'default',
	buttonSize = 'sm',
	additionalProps = {},
	intent = 'delete',
	showContentOnDoubleCheck = true,
	replacementContentOnDoubleCheck = 'Are you sure?',
}: ActionFormProps) {
	const isPending = useIsPending()
	const dc = useDoubleCheck()

	return (
		<Form method={method} action={action} {...additionalProps}>
			<AuthenticityTokenInput />
			{Object.entries(data).map(([key, value]) => (
				<input key={key} type="hidden" name={key} value={value} />
			))}
			<StatusButton
				variant={buttonVariant}
				status={isPending ? 'pending' : 'idle'}
				size={buttonSize}
				disabled={isPending}
				{...dc.getButtonProps({
					className: 'mx-auto',
					name: 'intent',
					value: intent,
					type: 'submit',
				})}
			>
				{dc.doubleCheck ? (
					<div className="flex items-center space-x-1">
						{showContentOnDoubleCheck ? buttonContent : null}
						<span>{replacementContentOnDoubleCheck}</span>
					</div>
				) : (
					buttonContent
				)}
			</StatusButton>
		</Form>
	)
}

type ActionButtonProps = {
	method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
	action?: string
	data?: { [key: string]: any }
	buttonContent: ReactNode
	buttonVariant?:
		| 'default'
		| 'destructive'
		| 'outline'
		| 'secondary'
		| 'ghost'
		| 'link'
	buttonSize?: 'default' | 'sm' | 'lg' | 'icon' | 'xs' | null | undefined
	additionalProps?: React.HTMLAttributes<HTMLFormElement>
	intent?: string
	confirmation?: {
		title: string
		description: string
		cancelLabel?: string
		confirmLabel?: string
	}
}

export function ActionButton({
	method = 'POST',
	action = '',
	data = {},
	buttonContent,
	buttonVariant = 'default',
	buttonSize = 'sm',
	additionalProps = {},
	intent,
	confirmation,
}: ActionButtonProps) {
	const isPending = useIsPending()
	const [showConfirmation, setShowConfirmation] = useState(false)

	const button = (
		<StatusButton
			variant={buttonVariant}
			status={isPending ? 'pending' : 'idle'}
			size={buttonSize}
			disabled={isPending}
			onClick={confirmation ? () => setShowConfirmation(true) : undefined}
			type={confirmation ? 'button' : 'submit'}
			name={intent ? 'intent' : undefined}
			value={intent}
		>
			{buttonContent}
		</StatusButton>
	)

	if (!confirmation) {
		return (
			<Form method={method} action={action} {...additionalProps}>
				<AuthenticityTokenInput />
				{Object.entries(data).map(([key, value]) => (
					<input key={key} type="hidden" name={key} value={value} />
				))}
				{button}
			</Form>
		)
	}

	return (
		<>
			{button}
			<Dialog open={showConfirmation} onOpenChange={setShowConfirmation}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{confirmation.title}</DialogTitle>
						<DialogDescription>{confirmation.description}</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setShowConfirmation(false)}
						>
							{confirmation.cancelLabel || 'Cancel'}
						</Button>
						<Form
							method={method}
							action={action}
							{...additionalProps}
							onSubmit={() => setShowConfirmation(false)}
						>
							<AuthenticityTokenInput />
							{Object.entries(data).map(([key, value]) => (
								<input key={key} type="hidden" name={key} value={value} />
							))}
							<Button
								type="submit"
								name={intent ? 'intent' : undefined}
								value={intent}
							>
								{confirmation.confirmLabel || 'Confirm'}
							</Button>
						</Form>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	)
}
