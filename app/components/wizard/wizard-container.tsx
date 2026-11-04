import { cn } from '~/utils/misc'
import { Card, CardContent } from '~/components/ui/card'

export interface WizardStep {
	id: number
	title: string
	description?: string
}

interface WizardContainerProps {
	steps: WizardStep[]
	currentStep: number
	children: React.ReactNode
	className?: string
}

export function WizardContainer({
	steps,
	currentStep,
	children,
	className,
}: WizardContainerProps) {
	return (
		<div className={cn('space-y-6', className)}>
			{/* Step Indicator */}
			<nav aria-label="Progress">
				<ol className="flex items-center justify-between">
					{steps.map((step, index) => {
						const isCompleted = step.id < currentStep
						const isCurrent = step.id === currentStep
						const isUpcoming = step.id > currentStep

						return (
							<li key={step.id} className="relative flex-1">
								<div className="flex flex-col items-center">
									{/* Step Circle */}
									<div
										className={cn(
											'flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors',
											isCompleted &&
												'border-primary bg-primary text-primary-foreground',
											isCurrent &&
												'border-primary bg-background text-primary',
											isUpcoming &&
												'border-muted bg-background text-muted-foreground',
										)}
									>
										{isCompleted ? (
											<svg
												className="h-5 w-5"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
											>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth={2}
													d="M5 13l4 4L19 7"
												/>
											</svg>
										) : (
											step.id
										)}
									</div>

									{/* Step Title */}
									<div className="mt-2 text-center">
										<span
											className={cn(
												'text-sm font-medium',
												isCurrent && 'text-primary',
												isUpcoming && 'text-muted-foreground',
											)}
										>
											{step.title}
										</span>
										{step.description && (
											<p className="text-xs text-muted-foreground hidden sm:block">
												{step.description}
											</p>
										)}
									</div>
								</div>

								{/* Connector Line */}
								{index < steps.length - 1 && (
									<div
										className={cn(
											'absolute left-[calc(50%+20px)] right-[calc(-50%+20px)] top-5 h-0.5',
											isCompleted ? 'bg-primary' : 'bg-muted',
										)}
										aria-hidden="true"
									/>
								)}
							</li>
						)
					})}
				</ol>
			</nav>

			{/* Step Content */}
			<Card>
				<CardContent className="pt-6">{children}</CardContent>
			</Card>
		</div>
	)
}

export function WizardStepContent({
	title,
	description,
	children,
}: {
	title: string
	description?: string
	children: React.ReactNode
}) {
	return (
		<div className="space-y-6">
			<div>
				<h2 className="text-lg font-semibold">{title}</h2>
				{description && (
					<p className="text-sm text-muted-foreground">{description}</p>
				)}
			</div>
			{children}
		</div>
	)
}
