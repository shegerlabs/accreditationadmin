import { CheckIcon } from 'lucide-react'

type Step = {
	id: string
	name: string
	status: 'complete' | 'current' | 'upcoming'
}

type StepsProps = {
	steps: Step[]
}

export default function Steps({ steps }: StepsProps) {
	return (
		<nav aria-label="Progress">
			<ol className="divide-y divide-gray-300 rounded-md border border-gray-300 md:flex md:divide-y-0">
				{steps.map((step, stepIdx) => (
					<li key={step.name} className="relative md:flex md:flex-1">
						{step.status === 'complete' ? (
							<div className="group flex w-full items-center">
								<span className="flex items-center px-6 py-4 text-sm font-medium">
									<span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-green-600">
										<CheckIcon
											aria-hidden="true"
											className="h-6 w-6 text-white"
										/>
									</span>
									<span className="ml-4 text-sm font-medium text-gray-900">
										{step.name}
									</span>
								</span>
							</div>
						) : step.status === 'current' ? (
							<div
								aria-current="step"
								className="flex items-center px-6 py-4 text-sm font-medium"
							>
								<span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border-2 border-green-600">
									<span className="text-green-600">{step.id}</span>
								</span>
								<span className="ml-4 text-sm font-medium text-green-600">
									{step.name}
								</span>
							</div>
						) : (
							<div className="group flex items-center">
								<span className="flex items-center px-6 py-4 text-sm font-medium">
									<span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border-2 border-gray-300">
										<span className="text-gray-500">{step.id}</span>
									</span>
									<span className="ml-4 text-sm font-medium text-gray-500">
										{step.name}
									</span>
								</span>
							</div>
						)}

						{stepIdx !== steps.length - 1 ? (
							<>
								{/* Arrow separator for large screens and up */}
								<div
									aria-hidden="true"
									className="absolute right-0 top-0 hidden h-full w-5 md:block"
								>
									<svg
										fill="none"
										viewBox="0 0 22 80"
										preserveAspectRatio="none"
										className="h-full w-full text-gray-300"
									>
										<path
											d="M0 -2L20 40L0 82"
											stroke="currentcolor"
											vectorEffect="non-scaling-stroke"
											strokeLinejoin="round"
										/>
									</svg>
								</div>
							</>
						) : null}
					</li>
				))}
			</ol>
		</nav>
	)
}
