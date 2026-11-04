import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { Form, useActionData, useFetcher, useNavigate, useParams } from '@remix-run/react'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { SelectField } from '~/components/conform/SelectField'
import { Field, FieldError } from '~/components/forms'
import { Button } from '~/components/ui/button'
import { Checkbox } from '~/components/ui/checkbox'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { RadioGroup, RadioGroupItem } from '~/components/ui/radio-group'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { useIsPending } from '~/utils/misc'
import { Loader2, Plus, Search, X } from 'lucide-react'

export const AccessEditorSchema = z.object({
	id: z.string().optional(),
	userId: z.string().min(1, 'User is required'),
	roleId: z.string().min(1, 'Role is required'),
	participantTypeSelection: z.enum(['all', 'some']),
	participantTypeIds: z.array(z.string()).optional(),
	stepName: z.string().min(1, 'Step is required'),
	eventId: z.string(),
})

// Schema for edit action (includes allIds for updating grouped records)
export const AccessEditSchema = z.object({
	id: z.string(),
	allIds: z.string(), // Comma-separated IDs to delete
	userId: z.string().min(1, 'User is required'),
	roleId: z.string().min(1, 'Role is required'),
	participantTypeSelection: z.enum(['all', 'some']),
	participantTypeIds: z.array(z.string()).optional(),
	stepName: z.string().min(1, 'Step is required'),
	eventId: z.string(),
})

// Schema for delete action (supports multiple IDs)
export const AccessDeleteSchema = z.object({
	id: z.string(),
	allIds: z.string(), // Comma-separated IDs
	eventId: z.string(),
})

type Workflow = {
	id: string
	name: string
	participantType: { id: string; name: string }
	steps: { id: string; name: string; order: number; requiresAssignment: boolean }[]
}

type UserSearchResult = {
	users: { id: string; username: string; email: string; name: string | null }[]
}

type UserCreateResult = {
	result: {
		status: 'success' | 'error'
		initialValue?: Record<string, unknown>
		error?: Record<string, string[]>
	}
	user?: { id: string; username: string; email: string; name: string | null }
}

export function AccessEditor({
	access,
	existingUser,
	existingStepName,
	existingParticipantTypeIds,
	allIds,
	recordCount,
	title,
	intent = 'create',
	roles,
	workflows,
	participantTypes,
	assignableStepNames,
	eventId,
}: {
	access?: {
		id: string
		userId: string
		roleId: string
		stepId: string
		participantTypeId?: string
	}
	existingUser?: { id: string; username: string; email: string }
	existingStepName?: string
	existingParticipantTypeIds?: string[]
	allIds?: string[]
	recordCount?: number
	title: string
	intent?: 'create' | 'edit' | 'delete'
	roles: { id: string; name: string }[]
	workflows: Workflow[]
	participantTypes: { id: string; name: string }[]
	assignableStepNames: string[]
	eventId: string
}) {
	const params = useParams()
	const actionData = useActionData<{ result?: any }>()
	const isPending = useIsPending()
	const navigate = useNavigate()

	// User search with fetcher
	const userFetcher = useFetcher<UserSearchResult>()
	const [userSearch, setUserSearch] = useState('')
	const [selectedUser, setSelectedUser] = useState<{
		id: string
		username: string
		email: string
	} | null>(existingUser ?? null)
	const [showUserResults, setShowUserResults] = useState(false)
	const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
	const userSearchRef = useRef<HTMLDivElement>(null)

	// User creation with fetcher and Conform
	const createUserFetcher = useFetcher<UserCreateResult>()
	const [isCreatingUser, setIsCreatingUser] = useState(false)
	const isCreatingUserPending = createUserFetcher.state === 'submitting'

	// Conform form for user creation
	const CreateUserSchema = z
		.object({
			name: z.string().min(1, 'Name is required'),
			username: z.string().min(3, 'Username must be at least 3 characters'),
			email: z.string().email('Invalid email address'),
			password: z.string().min(6, 'Password must be at least 6 characters'),
			confirmPassword: z.string().min(1, 'Confirm password is required'),
		})
		.refine(data => data.password === data.confirmPassword, {
			message: 'Passwords do not match',
			path: ['confirmPassword'],
		})

	const [createUserForm, createUserFields] = useForm({
		id: 'create-user-form',
		constraint: getZodConstraint(CreateUserSchema),
		lastResult: createUserFetcher.data?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: CreateUserSchema })
		},
	})

	const isEdit = intent === 'edit'

	// Handle successful user creation
	useEffect(() => {
		if (createUserFetcher.data?.user) {
			const newUser = createUserFetcher.data.user
			setSelectedUser({
				id: newUser.id,
				username: newUser.username,
				email: newUser.email,
			})
			setIsCreatingUser(false)
		}
	}, [createUserFetcher.data])

	// Debounced user search
	useEffect(() => {
		if (searchTimeoutRef.current) {
			clearTimeout(searchTimeoutRef.current)
		}

		if (userSearch.length >= 2) {
			searchTimeoutRef.current = setTimeout(() => {
				userFetcher.load(`/admin/resources/users?search=${encodeURIComponent(userSearch)}`)
			}, 300)
		}

		return () => {
			if (searchTimeoutRef.current) {
				clearTimeout(searchTimeoutRef.current)
			}
		}
	}, [userSearch])

	// Close dropdown when clicking outside
	useEffect(() => {
		function handleClickOutside(event: MouseEvent) {
			if (userSearchRef.current && !userSearchRef.current.contains(event.target as Node)) {
				setShowUserResults(false)
			}
		}

		document.addEventListener('mousedown', handleClickOutside)
		return () => document.removeEventListener('mousedown', handleClickOutside)
	}, [])

	const userResults = userFetcher.data?.users ?? []
	const isSearching = userFetcher.state === 'loading'

	// Participant type selection state - initialize based on existing data in edit mode
	const [participantTypeSelection, setParticipantTypeSelection] = useState<
		'all' | 'some'
	>(() => {
		if (isEdit && existingParticipantTypeIds && existingParticipantTypeIds.length > 0) {
			// If existing types match all available types, select 'all'
			if (existingParticipantTypeIds.length === participantTypes.length) {
				return 'all'
			}
			return 'some'
		}
		return 'all'
	})
	const [selectedParticipantTypeIds, setSelectedParticipantTypeIds] = useState<
		string[]
	>(existingParticipantTypeIds ?? [])

	// Determine which schema to use based on intent
	const getSchema = () => {
		if (intent === 'delete') return AccessDeleteSchema
		if (intent === 'edit') return AccessEditSchema
		return AccessEditorSchema
	}

	const [form, fields] = useForm({
		id: 'access-editor',
		constraint: getZodConstraint(getSchema()),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, {
				schema: getSchema(),
			})
		},
		defaultValue: {
			id: access?.id,
			allIds: allIds?.join(',') ?? access?.id ?? '',
			userId: access?.userId ?? existingUser?.id ?? '',
			roleId: access?.roleId ?? '',
			participantTypeSelection: participantTypeSelection,
			participantTypeIds: existingParticipantTypeIds ?? [],
			stepName: existingStepName ?? '',
			eventId: eventId,
		},
	})

	const handleSelectUser = (user: { id: string; username: string; email: string }) => {
		setSelectedUser(user)
		setUserSearch('')
		setShowUserResults(false)
	}

	const handleClearUser = () => {
		setSelectedUser(null)
		setUserSearch('')
	}

	const handleCancelCreateUser = () => {
		setIsCreatingUser(false)
	}

	const isDelete = intent === 'delete'

	const handleParticipantTypeToggle = (participantTypeId: string) => {
		setSelectedParticipantTypeIds(prev =>
			prev.includes(participantTypeId)
				? prev.filter(id => id !== participantTypeId)
				: [...prev, participantTypeId],
		)
	}

	return (
		<Dialog
			open={true}
			onOpenChange={() => navigate(`/admin/events/${params.eventId}/access`)}
		>
			<DialogContent
				className="sm:max-w-[600px]"
				onInteractOutside={e => e.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>{isCreatingUser ? 'Create New User' : title}</DialogTitle>
					<DialogDescription>
						{isCreatingUser
							? 'Create a new user to grant them access to this event.'
							: isDelete
								? 'Are you sure you want to revoke this access?'
								: isEdit
									? 'Modify the role, step, or participant types for this access.'
									: 'Grant a user access to this event with a specific role and step.'}
					</DialogDescription>
				</DialogHeader>

				{/* Create New User Form - Separate from main form to avoid nesting */}
				{isCreatingUser ? (
					<createUserFetcher.Form
						method="POST"
						action="/admin/resources/users"
						{...getFormProps(createUserForm)}
					>
						<div className="grid gap-4 py-4 px-1 max-h-[60vh] overflow-y-auto">
							<Field>
								<Label htmlFor={createUserFields.name.id}>Name</Label>
								<Input
									{...getInputProps(createUserFields.name, { type: 'text' })}
									placeholder="Full name"
									key={createUserFields.name.key}
								/>
								{createUserFields.name.errors && (
									<FieldError>{createUserFields.name.errors}</FieldError>
								)}
							</Field>
							<Field>
								<Label htmlFor={createUserFields.username.id}>Username</Label>
								<Input
									{...getInputProps(createUserFields.username, { type: 'text' })}
									placeholder="Username"
									key={createUserFields.username.key}
								/>
								{createUserFields.username.errors && (
									<FieldError>{createUserFields.username.errors}</FieldError>
								)}
							</Field>
							<Field>
								<Label htmlFor={createUserFields.email.id}>Email</Label>
								<Input
									{...getInputProps(createUserFields.email, { type: 'email' })}
									placeholder="Email address"
									key={createUserFields.email.key}
								/>
								{createUserFields.email.errors && (
									<FieldError>{createUserFields.email.errors}</FieldError>
								)}
							</Field>
							<Field>
								<Label htmlFor={createUserFields.password.id}>Password</Label>
								<Input
									{...getInputProps(createUserFields.password, { type: 'password' })}
									placeholder="Password (min 6 characters)"
									key={createUserFields.password.key}
								/>
								{createUserFields.password.errors && (
									<FieldError>{createUserFields.password.errors}</FieldError>
								)}
							</Field>
							<Field>
								<Label htmlFor={createUserFields.confirmPassword.id}>Confirm Password</Label>
								<Input
									{...getInputProps(createUserFields.confirmPassword, { type: 'password' })}
									placeholder="Confirm password"
									key={createUserFields.confirmPassword.key}
								/>
								{createUserFields.confirmPassword.errors && (
									<FieldError>{createUserFields.confirmPassword.errors}</FieldError>
								)}
							</Field>
						</div>
						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={handleCancelCreateUser}
							>
								Cancel
							</Button>
							<Button type="submit" disabled={isCreatingUserPending}>
								{isCreatingUserPending ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Creating...
									</>
								) : (
									<>
										<Plus className="mr-2 h-4 w-4" />
										Create User
									</>
								)}
							</Button>
						</DialogFooter>
					</createUserFetcher.Form>
				) : (
					/* Main Access Form */
					<Form method="POST" {...getFormProps(form)}>
						<AuthenticityTokenInput />
						<HoneypotInputs />

						<input
							{...getInputProps(fields.id, { type: 'hidden' })}
							key={fields.id.key}
						/>
						<input
							{...getInputProps(fields.eventId, { type: 'hidden' })}
							key={fields.eventId.key}
						/>
						{(isDelete || isEdit) && (
							<input
								type="hidden"
								name="allIds"
								value={allIds?.join(',') ?? access?.id ?? ''}
							/>
						)}
						<input type="hidden" name="intent" value={intent} />

						{/* Delete mode only needs id, allIds, and eventId, which are already rendered above */}

						{!isDelete && (
							<div className="grid gap-4 py-4 px-1 max-h-[60vh] overflow-y-auto">
								{/* User Selection with Server-side Search */}
								<Field>
									<Label htmlFor="user-search">User</Label>
									<input
										type="hidden"
										name={fields.userId.name}
										value={selectedUser?.id ?? ''}
									/>
									<div className="relative" ref={userSearchRef}>
										{selectedUser ? (
											<div className="flex items-center justify-between rounded-md border bg-muted/50 px-3 py-2">
												<div>
													<span className="font-medium">{selectedUser.username}</span>
													<span className="text-muted-foreground ml-2">
														({selectedUser.email})
													</span>
												</div>
												{/* Only show clear button in create mode, not edit mode */}
												{!isEdit && (
													<Button
														type="button"
														variant="ghost"
														size="sm"
														className="h-6 w-6 p-0"
														onClick={handleClearUser}
													>
														<X className="h-4 w-4" />
													</Button>
												)}
											</div>
										) : (
											/* Search Existing User */
											<>
												<div className="relative">
													<Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
													<Input
														id="user-search"
														type="text"
														placeholder="Type at least 2 characters to search..."
														value={userSearch}
														onChange={e => {
															setUserSearch(e.target.value)
															setShowUserResults(true)
														}}
														onFocus={() => setShowUserResults(true)}
														className="pl-9"
														autoComplete="off"
													/>
													{isSearching && (
														<Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
													)}
												</div>

												{/* Search Results Dropdown */}
												{showUserResults && userSearch.length >= 2 && (
													<div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg">
														{isSearching ? (
															<div className="p-3 text-center text-sm text-muted-foreground">
																Searching...
															</div>
														) : userResults.length > 0 ? (
															<ul className="max-h-48 overflow-y-auto py-1">
																{userResults.map(user => (
																	<li key={user.id}>
																		<button
																			type="button"
																			className="w-full px-3 py-2 text-left hover:bg-accent focus:bg-accent focus:outline-none"
																			onClick={() => handleSelectUser(user)}
																		>
																			<div className="font-medium">{user.username}</div>
																			<div className="text-sm text-muted-foreground">
																				{user.email}
																				{user.name && ` - ${user.name}`}
																			</div>
																		</button>
																	</li>
																))}
															</ul>
														) : (
															<div className="p-3 text-center text-sm text-muted-foreground">
																No users found
															</div>
														)}
													</div>
												)}

												{userSearch.length > 0 && userSearch.length < 2 && (
													<p className="text-xs text-muted-foreground mt-1">
														Type at least 2 characters to search
													</p>
												)}

												{/* Create New User Button */}
												<button
													type="button"
													className="mt-2 flex items-center text-sm text-primary hover:underline"
													onClick={() => setIsCreatingUser(true)}
												>
													<Plus className="mr-1 h-4 w-4" />
													Create new user
												</button>
											</>
										)}
									</div>
									{fields.userId.errors && (
										<FieldError>{fields.userId.errors}</FieldError>
									)}
								</Field>

							{/* Role Selection */}
							<Field>
								<Label htmlFor={fields.roleId.id}>Role</Label>
								<SelectField
									meta={fields.roleId}
									items={roles.map(role => ({
										name: role.name,
										value: role.id,
									}))}
									placeholder="Select a role"
								/>
								{fields.roleId.errors && (
									<FieldError>{fields.roleId.errors}</FieldError>
								)}
							</Field>

							{/* Participant Type Selection - Radio */}
							<Field>
								<Label>Participant Types</Label>
								<RadioGroup
									value={participantTypeSelection}
									onValueChange={value =>
										setParticipantTypeSelection(value as 'all' | 'some')
									}
									className="mt-2"
								>
									<div className="flex items-center space-x-2">
										<RadioGroupItem value="all" id="pt-all" />
										<Label htmlFor="pt-all" className="font-normal">
											All Participant Types ({participantTypes.length})
										</Label>
									</div>
									<div className="flex items-center space-x-2">
										<RadioGroupItem value="some" id="pt-some" />
										<Label htmlFor="pt-some" className="font-normal">
											Select Specific
										</Label>
									</div>
								</RadioGroup>
								<input
									type="hidden"
									name="participantTypeSelection"
									value={participantTypeSelection}
								/>

								{/* Checkbox list for specific participant types */}
								{participantTypeSelection === 'some' && (
									<div className="mt-3">
										<div className="flex items-center justify-between mb-2">
											<span className="text-sm text-muted-foreground">
												{selectedParticipantTypeIds.length} of {participantTypes.length} selected
											</span>
											<div className="flex items-center gap-2 text-sm">
												<button
													type="button"
													className="text-primary hover:underline"
													onClick={() =>
														setSelectedParticipantTypeIds(
															participantTypes.map(pt => pt.id),
														)
													}
												>
													Select all
												</button>
												<span className="text-muted-foreground">|</span>
												<button
													type="button"
													className="text-primary hover:underline"
													onClick={() => setSelectedParticipantTypeIds([])}
												>
													Clear
												</button>
											</div>
										</div>
										<div className="border rounded-md p-3 max-h-40 overflow-y-auto space-y-2">
											{participantTypes.map(pt => (
												<div key={pt.id} className="flex items-center space-x-2">
													<Checkbox
														id={`pt-${pt.id}`}
														checked={selectedParticipantTypeIds.includes(pt.id)}
														onCheckedChange={() =>
															handleParticipantTypeToggle(pt.id)
														}
													/>
													<Label htmlFor={`pt-${pt.id}`} className="font-normal">
														{pt.name}
													</Label>
													<input
														type="hidden"
														name="participantTypeIds"
														value={pt.id}
														disabled={
															!selectedParticipantTypeIds.includes(pt.id)
														}
													/>
												</div>
											))}
											{participantTypes.length === 0 && (
												<p className="text-sm text-muted-foreground">
													No participant types found
												</p>
											)}
										</div>
									</div>
								)}
								{participantTypeSelection === 'some' &&
									selectedParticipantTypeIds.length === 0 && (
										<p className="text-sm text-destructive mt-1">
											Please select at least one participant type
										</p>
									)}
							</Field>

							{/* Step Selection by Name */}
							<Field>
								<Label htmlFor={fields.stepName.id}>Step</Label>
								<SelectField
									meta={fields.stepName}
									items={assignableStepNames.map(name => ({
										name: name,
										value: name,
									}))}
									placeholder="Select a step"
								/>
								<p className="text-xs text-muted-foreground mt-1">
									Access will be granted for this step across{' '}
									{participantTypeSelection === 'all'
										? 'all participant types'
										: `${selectedParticipantTypeIds.length} selected participant type(s)`}
								</p>
								{fields.stepName.errors && (
									<FieldError>{fields.stepName.errors}</FieldError>
								)}
							</Field>
						</div>
					)}

					{isDelete && access && (
						<div className="py-4">
							<p className="text-sm text-muted-foreground">
								This will revoke {recordCount && recordCount > 1 ? `${recordCount} access records` : 'access'} for this user.
								They will no longer be able to access this event with this role
								{recordCount && recordCount > 1 ? ` across ${recordCount} participant types` : ''}.
							</p>
						</div>
					)}

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => navigate(`/admin/events/${params.eventId}/access`)}
						>
							Cancel
						</Button>
						<Button
							type="submit"
							variant={isDelete ? 'destructive' : 'default'}
							disabled={
								isPending ||
								(!isDelete && !selectedUser) ||
								(!isDelete &&
									participantTypeSelection === 'some' &&
									selectedParticipantTypeIds.length === 0)
							}
						>
							{isPending
								? isDelete
									? 'Revoking...'
									: isEdit
										? 'Updating...'
										: 'Granting...'
								: isDelete
									? 'Revoke Access'
									: isEdit
										? 'Update Access'
										: 'Grant Access'}
						</Button>
					</DialogFooter>
				</Form>
				)}
			</DialogContent>
		</Dialog>
	)
}
