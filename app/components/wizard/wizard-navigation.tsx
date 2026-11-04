import { useNavigation } from '@remix-run/react'
import { ArrowLeft, ArrowRight, Save, X } from 'lucide-react'
import { Button } from '~/components/ui/button'

interface WizardNavigationProps {
	currentStep: number
	totalSteps: number
	canProceed: boolean
	onBack?: () => void
	onNext?: () => void
	onCancel?: () => void
	onSave?: () => void
	isSubmitting?: boolean
	nextLabel?: string
	saveLabel?: string
}

export function WizardNavigation({
	currentStep,
	totalSteps,
	canProceed,
	onBack,
	onNext,
	onCancel,
	onSave,
	isSubmitting,
	nextLabel = 'Next',
	saveLabel = 'Save Report',
}: WizardNavigationProps) {
	const navigation = useNavigation()
	const isPending = navigation.state !== 'idle' || isSubmitting

	const isFirstStep = currentStep === 1
	const isLastStep = currentStep === totalSteps

	return (
		<div className="flex items-center justify-between border-t pt-6">
			<div>
				{onCancel && (
					<Button
						type="button"
						variant="ghost"
						onClick={onCancel}
						disabled={isPending}
					>
						<X className="mr-2 h-4 w-4" />
						Cancel
					</Button>
				)}
			</div>

			<div className="flex gap-3">
				{!isFirstStep && onBack && (
					<Button
						type="button"
						variant="outline"
						onClick={onBack}
						disabled={isPending}
					>
						<ArrowLeft className="mr-2 h-4 w-4" />
						Back
					</Button>
				)}

				{!isLastStep && onNext && (
					<Button
						type="button"
						onClick={onNext}
						disabled={!canProceed || isPending}
					>
						{nextLabel}
						<ArrowRight className="ml-2 h-4 w-4" />
					</Button>
				)}

				{isLastStep && onSave && (
					<Button
						type="button"
						onClick={onSave}
						disabled={!canProceed || isPending}
					>
						{isPending ? (
							<>
								<span className="mr-2 h-4 w-4 animate-spin">...</span>
								Saving...
							</>
						) : (
							<>
								<Save className="mr-2 h-4 w-4" />
								{saveLabel}
							</>
						)}
					</Button>
				)}
			</div>
		</div>
	)
}
