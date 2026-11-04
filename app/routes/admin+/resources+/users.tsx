import { parseWithZod } from '@conform-to/zod'
import { json, LoaderFunctionArgs, ActionFunctionArgs } from '@remix-run/node'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { requireAdminAccess } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'

export const CreateUserSchema = z
	.object({
		name: z.string().min(1, 'Name is required'),
		username: z.string().min(3, 'Username must be at least 3 characters'),
		email: z.string().email('Invalid email address'),
		password: z.string().min(6, 'Password must be at least 6 characters'),
		confirmPassword: z.string().min(1, 'Confirm password is required'),
		tenantId: z.string().optional(),
	})
	.refine(data => data.password === data.confirmPassword, {
		message: 'Passwords do not match',
		path: ['confirmPassword'],
	})

export async function action({ request }: ActionFunctionArgs) {
	const user = await requireAdminAccess(request)
	const formData = await request.formData()

	const submission = await parseWithZod(formData, {
		schema: CreateUserSchema.superRefine(async (data, ctx) => {
			// Check if username already exists
			const existingUsername = await prisma.user.findUnique({
				where: { username: data.username },
			})
			if (existingUsername) {
				ctx.addIssue({
					path: ['username'],
					code: z.ZodIssueCode.custom,
					message: 'Username already exists',
				})
			}

			// Check if email already exists
			const existingEmail = await prisma.user.findUnique({
				where: { email: data.email },
			})
			if (existingEmail) {
				ctx.addIssue({
					path: ['email'],
					code: z.ZodIssueCode.custom,
					message: 'Email already exists',
				})
			}
		}),
		async: true,
	})

	if (submission.status !== 'success') {
		return json({ result: submission.reply() }, { status: 400 })
	}

	const { name, username, email, password, tenantId } = submission.value

	// Determine tenant ID for the new user
	let assignedTenantId: string | null = null
	if (user.isGlobalAdmin && tenantId) {
		assignedTenantId = tenantId
	} else if (!user.isGlobalAdmin && user.tenantId) {
		assignedTenantId = user.tenantId
	}

	// Hash password and create user
	const hashedPassword = await bcrypt.hash(password, 10)

	const newUser = await prisma.user.create({
		data: {
			name,
			username,
			email,
			password: { create: { hash: hashedPassword } },
			tenantId: assignedTenantId,
		},
		select: {
			id: true,
			username: true,
			email: true,
			name: true,
		},
	})

	return json({
		result: submission.reply({ resetForm: true }),
		user: newUser,
	})
}

export async function loader({ request }: LoaderFunctionArgs) {
	const user = await requireAdminAccess(request)

	const url = new URL(request.url)
	const search = url.searchParams.get('search') ?? ''
	const tenantId = url.searchParams.get('tenantId')

	// Require at least 2 characters to search
	if (search.length < 2) {
		return json({ users: [] })
	}

	// System seed users that should be hidden from tenant admins
	const SYSTEM_SEED_USERS = [
		'focal',
		'firstvalidator',
		'secondvalidator',
		'badgeprinter',
		'dispatcher',
		'tenantadmin',
	]

	// Search condition - matches username, email, or name
	const searchCondition = {
		OR: [
			{ username: { contains: search, mode: 'insensitive' as const } },
			{ email: { contains: search, mode: 'insensitive' as const } },
			{ name: { contains: search, mode: 'insensitive' as const } },
		],
	}

	let users
	if (user.isGlobalAdmin) {
		// Global admin can filter by specific tenant or see all
		users = await prisma.user.findMany({
			where: {
				...searchCondition,
				...(tenantId ? { tenantId } : {}),
			},
			select: {
				id: true,
				username: true,
				email: true,
				name: true,
				tenantId: true,
			},
			orderBy: { username: 'asc' },
			take: 15,
		})
	} else {
		// Non-global admins can see users from their tenant OR orphan users
		// But exclude system seed users and global admins
		users = await prisma.user.findMany({
			where: {
				AND: [
					searchCondition,
					// Tenant filter: their tenant OR unassigned
					{
						OR: [
							{ tenantId: user.tenantId },
							{ tenantId: { equals: null } },
						],
					},
					// Exclude system seed users
					{ username: { notIn: SYSTEM_SEED_USERS } },
					// Exclude global admins
					{
						NOT: {
							roles: {
								some: {
									name: 'admin',
								},
							},
						},
					},
				],
			},
			select: {
				id: true,
				username: true,
				email: true,
				name: true,
				tenantId: true,
			},
			orderBy: { username: 'asc' },
			take: 15,
		})
	}

	return json({ users })
}
