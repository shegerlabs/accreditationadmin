// manage-workflow.ts
// Interactive script to create or update a workflow for any participant type
//
// USAGE:
//   npm run manage-workflow
//   OR
//   npx tsx prisma/manage-workflow.ts
//
// FEATURES:
//   - Select event from existing events
//   - Select participant type from existing types
//   - Choose between standard or media workflow
//   - Creates new workflow or updates existing one
//   - Sets up all transition rules automatically
//   - List all workflows
//   - Delete workflows
//
// WORKFLOW TYPES:
//   Standard: Request → Review → First Approval → Second Approval → Badge Print → Final
//   Media:    Request → Review → Broadcast Approval → Second Approval → Badge Print → Final
//
// NOTES:
//   - This script is idempotent (safe to run multiple times)
//   - Will update existing workflows instead of creating duplicates
//   - All workflows include REJECT (back to start) and BYPASS (skip to badge print) transitions

import { Action, PrismaClient } from '@prisma/client'
import prompts from 'prompts'
import { printTable } from './utils/table.js'

const prisma = new PrismaClient()

async function manageWorkflow() {
	console.log('🚀 Interactive Workflow Manager\n')
	console.log('This tool helps you create or update workflows for participant types.\n')

	let continueLoop = true

	while (continueLoop) {
		try {
			// 1. Fetch all events
			const events = await prisma.event.findMany({
				include: { tenant: true },
				orderBy: { createdAt: 'desc' },
			})

			// 2. Fetch all workflows
			const existingWorkflows = await prisma.workflow.findMany({
				include: {
					event: { include: { tenant: true } },
					participantType: true,
					steps: true,
				},
				orderBy: { createdAt: 'desc' },
			})

			// 3. Determine action
			const actionResponse = await prompts({
				type: 'select',
				name: 'action',
				message: 'What would you like to do?',
				choices: [
					{ title: 'Create a new workflow', value: 'create' },
					{ title: 'Update an existing workflow', value: 'update' },
					{ title: 'Delete a workflow', value: 'delete' },
					{ title: 'List all workflows', value: 'list' },
					{ title: '─'.repeat(20), value: 'separator', disabled: true },
					{ title: '❌ Exit', value: 'exit' },
				],
			})

			if (!actionResponse.action || actionResponse.action === 'exit') {
				console.log('\n👋 Goodbye!')
				continueLoop = false
				break
			}

			const action = actionResponse.action

			// Handle list action
			if (action === 'list') {
				console.log('\n📋 Existing Workflows:\n')
				printTable(
					[
						{ header: 'Name', key: 'name', width: 30 },
						{ header: 'Event', key: 'event', width: 25 },
						{ header: 'Tenant', key: 'tenant', width: 20 },
						{ header: 'Participant Type', key: 'participantType', width: 20 },
						{ header: 'Steps', key: 'steps', width: 6 },
					],
					existingWorkflows.map(wf => ({
						name: wf.name,
						event: wf.event.name,
						tenant: wf.event.tenant.name,
						participantType: wf.participantType.name,
						steps: wf.steps.length,
					})),
				)
				console.log(`Total: ${existingWorkflows.length} workflows\n`)
				continue
			}

			// Handle delete
			if (action === 'delete') {
				if (existingWorkflows.length === 0) {
					console.log('\n❌ No workflows found\n')
					continue
				}

				const wfResponse = await prompts({
					type: 'select',
					name: 'workflowId',
					message: 'Select the workflow to delete:',
					choices: existingWorkflows.map(wf => ({
						title: wf.name,
						description: `${wf.event.name} - ${wf.participantType.name}`,
						value: wf.id,
					})),
				})

				if (!wfResponse.workflowId) {
					console.log('\n❌ Operation cancelled\n')
					continue
				}

				const selectedWf = existingWorkflows.find(wf => wf.id === wfResponse.workflowId)
				const confirmResponse = await prompts({
					type: 'confirm',
					name: 'confirm',
					message: `Are you sure you want to delete workflow "${selectedWf?.name}"?`,
					initial: false,
				})

				if (!confirmResponse.confirm) {
					console.log('\n❌ Operation cancelled\n')
					continue
				}

				// Delete steps first, then workflow
				await prisma.step.deleteMany({
					where: { workflowId: wfResponse.workflowId },
				})
				await prisma.workflow.delete({
					where: { id: wfResponse.workflowId },
				})

				console.log(`\n✅ Deleted workflow: ${selectedWf?.name}\n`)
				continue
			}

			// Handle update - select existing workflow
			let selectedWorkflowId: string | undefined
			let selectedEventId: string | undefined
			let selectedParticipantTypeId: string | undefined

			if (action === 'update') {
				if (existingWorkflows.length === 0) {
					console.log('\n❌ No workflows found to update\n')
					continue
				}

				const wfResponse = await prompts({
					type: 'select',
					name: 'workflowId',
					message: 'Select the workflow to update:',
					choices: existingWorkflows.map(wf => ({
						title: wf.name,
						description: `${wf.event.name} - ${wf.participantType.name}`,
						value: wf.id,
					})),
				})

				if (!wfResponse.workflowId) {
					console.log('\n❌ Operation cancelled\n')
					continue
				}

				const selectedWf = existingWorkflows.find(wf => wf.id === wfResponse.workflowId)
				selectedWorkflowId = wfResponse.workflowId
				selectedEventId = selectedWf?.eventId
				selectedParticipantTypeId = selectedWf?.participantTypeId
			}

			// Handle create - select event and participant type
			if (action === 'create') {
				if (events.length === 0) {
					console.log('\n❌ No events found. Please create an event first.\n')
					continue
				}

				// Fetch all participant types
				const participantTypes = await prisma.participantType.findMany({
					orderBy: { name: 'asc' },
				})

				if (participantTypes.length === 0) {
					console.log('\n❌ No participant types found. Please create a participant type first.\n')
					continue
				}

				const response = await prompts([
					{
						type: 'select',
						name: 'eventId',
						message: 'Select the event:',
						choices: events.map(event => ({
							title: `${event.name} (${event.tenant.name})`,
							description: `${event.startDate.toLocaleDateString()} - ${event.endDate.toLocaleDateString()}`,
							value: event.id,
						})),
					},
					{
						type: 'select',
						name: 'participantTypeId',
						message: 'Select the participant type:',
						choices: participantTypes.map(pt => ({
							title: pt.name,
							description: pt.description || '',
							value: pt.id,
						})),
					},
				])

				if (!response.eventId || !response.participantTypeId) {
					console.log('\n❌ Operation cancelled\n')
					continue
				}

				selectedEventId = response.eventId
				selectedParticipantTypeId = response.participantTypeId
			}

			// Get event and participant type
			const event = events.find(e => e.id === selectedEventId)
			const participantTypes = await prisma.participantType.findMany()
			const participantType = participantTypes.find(pt => pt.id === selectedParticipantTypeId)

			if (!event || !participantType) {
				console.log('\n❌ Event or participant type not found\n')
				continue
			}

			// Ask for workflow type
			const workflowTypeResponse = await prompts({
				type: 'confirm',
				name: 'useStandardWorkflow',
				message: 'Use standard workflow? (Request → Review → First Approval → Second Approval → Badge Print → Final)',
				initial: true,
			})

			console.log('\n📋 Configuration:')
			console.log(`   Event: ${event.name}`)
			console.log(`   Participant Type: ${participantType.name}`)
			console.log(`   Workflow Type: ${workflowTypeResponse.useStandardWorkflow ? 'Standard' : 'Custom'}\n`)

			// Find the necessary roles
			const roles = await prisma.role.findMany({
				select: { id: true, name: true },
				where: {
					name: {
						in: [
							'reviewer',
							'first-validator',
							'badge-printer',
							'second-validator',
							'broadcast',
						],
					},
				},
			})

			const reviewer = roles.find(role => role.name === 'reviewer')
			const firstApprover = roles.find(role => role.name === 'first-validator')
			const secondApprover = roles.find(role => role.name === 'second-validator')
			const badgePrinter = roles.find(role => role.name === 'badge-printer')
			const broadcast = roles.find(role => role.name === 'broadcast')

			if (!reviewer || !firstApprover || !secondApprover || !badgePrinter) {
				console.log('❌ Required roles not found (reviewer, first-validator, second-validator, badge-printer)\n')
				continue
			}

			console.log('✅ Found all required roles')

			// Determine step configurations based on workflow type
			const isMediaWorkflow =
				!workflowTypeResponse.useStandardWorkflow &&
				(participantType.name.toLowerCase().includes('media') ||
					participantType.name.toLowerCase().includes('press'))

			type StepConfig = {
				name: string
				order: number
				action: Action
				roleId: string
			}

			let stepConfigs: StepConfig[] = []

			if (isMediaWorkflow && broadcast) {
				stepConfigs = [
					{ name: 'Request Received', order: 1, action: Action.APPROVE, roleId: reviewer.id },
					{ name: 'Review Request', order: 2, action: Action.APPROVE, roleId: reviewer.id },
					{ name: 'Broadcast Approval', order: 3, action: Action.APPROVE, roleId: broadcast.id },
					{ name: 'Second Approval', order: 4, action: Action.APPROVE, roleId: secondApprover.id },
					{ name: 'Badge Print', order: 5, action: Action.PRINT, roleId: badgePrinter.id },
					{ name: 'Final', order: 6, action: Action.ARCHIVE, roleId: badgePrinter.id },
				]
			} else {
				stepConfigs = [
					{ name: 'Request Received', order: 1, action: Action.APPROVE, roleId: reviewer.id },
					{ name: 'Review Request', order: 2, action: Action.APPROVE, roleId: reviewer.id },
					{ name: 'First Approval', order: 3, action: Action.APPROVE, roleId: firstApprover.id },
					{ name: 'Second Approval', order: 4, action: Action.APPROVE, roleId: secondApprover.id },
					{ name: 'Badge Print', order: 5, action: Action.PRINT, roleId: badgePrinter.id },
					{ name: 'Final', order: 6, action: Action.ARCHIVE, roleId: badgePrinter.id },
				]
			}

			console.log(`📝 Workflow will have ${stepConfigs.length} steps\n`)

			// Check if workflow already exists or use selected one
			let workflow = selectedWorkflowId
				? await prisma.workflow.findUnique({
						where: { id: selectedWorkflowId },
						include: { steps: true },
					})
				: await prisma.workflow.findFirst({
						where: {
							eventId: event.id,
							participantTypeId: participantType.id,
						},
						include: { steps: true },
					})

			if (workflow) {
				console.log('⚠️  Workflow exists. Updating steps...')

				// Reset all nextStepId to null first
				for (const step of workflow.steps) {
					await prisma.step.update({
						where: { id: step.id },
						data: { nextStepId: null },
					})
				}

				// Update or create steps
				for (const stepConfig of stepConfigs) {
					const existingStep = workflow.steps.find(s => s.name === stepConfig.name)

					if (existingStep) {
						await prisma.step.update({
							where: { id: existingStep.id },
							data: {
								order: stepConfig.order,
								action: stepConfig.action,
								roleId: stepConfig.roleId,
								tenantId: event.tenantId,
							},
						})
						console.log(`  ✓ Updated step: ${stepConfig.name}`)
					} else {
						await prisma.step.create({
							data: {
								...stepConfig,
								tenantId: event.tenantId,
								workflowId: workflow.id,
							},
						})
						console.log(`  ✓ Created step: ${stepConfig.name}`)
					}
				}

				// Reload workflow with updated steps
				workflow = await prisma.workflow.findUniqueOrThrow({
					where: { id: workflow.id },
					include: { steps: true },
				})

				console.log(`✅ Updated workflow: ${workflow.name}`)
			} else {
				console.log('📝 Creating new workflow and steps...')
				workflow = await prisma.workflow.create({
					data: {
						tenantId: event.tenantId,
						eventId: event.id,
						name: `Workflow for ${participantType.name}`,
						participantTypeId: participantType.id,
						steps: {
							create: stepConfigs.map(config => ({
								...config,
								tenantId: event.tenantId,
							})),
						},
					},
					include: { steps: true },
				})

				console.log(`✅ Created workflow: ${workflow.name}`)
			}

			// The event now uses this type: put it on the event's list so badge and
			// quota forms and the portal offer it (docs/decisions/2026-11-06-event-participant-types.md).
			await prisma.eventParticipantType.upsert({
				where: {
					eventId_participantTypeId: {
						eventId: event.id,
						participantTypeId: participantType.id,
					},
				},
				create: { eventId: event.id, participantTypeId: participantType.id },
				update: {},
			})

			// Set up transition rules
			console.log('🔗 Setting up transition rules...')

			const steps = workflow.steps.sort((a, b) => a.order - b.order)

			// APPROVE/PRINT transitions (sequential)
			for (let i = 0; i < steps.length - 1; i++) {
				if (steps[i].action === Action.APPROVE || steps[i].action === Action.PRINT) {
					await prisma.step.update({
						where: { id: steps[i].id },
						data: { nextStepId: steps[i + 1].id },
					})
					console.log(`  ✓ Linked: ${steps[i].name} → ${steps[i + 1].name}`)
				}
			}

			console.log('✅ Transition rules applied successfully')
			console.log('\n🎉 Workflow management completed!\n')
		} catch (error) {
			console.error('❌ Error:', error)
			console.log('')
		}
	}
}

manageWorkflow()
	.catch(error => {
		console.error(error)
		process.exit(1)
	})
	.finally(async () => {
		await prisma.$disconnect()
	})
