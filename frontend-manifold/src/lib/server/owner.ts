import {
	isValidUsername,
	PASSWORD_MAX_LENGTH,
	PASSWORD_MIN_LENGTH,
	USERNAME_MAX_LENGTH,
	USERNAME_MIN_LENGTH
} from '$lib/schemas/rules';
import { hashPassword } from 'better-auth/crypto';
import { and, count, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Database } from './db';
import { account, session, twoFactor, user } from './db/schema';

// Plain module: the startup hook and the CLI both use it.

const OWNER_LOCK_KEY = 7_264_519_032;
const CREDENTIAL_PROVIDER = 'credential';

const usernameRule = z.string({ error: 'is required' }).refine(isValidUsername, {
	message: `must be ${USERNAME_MIN_LENGTH} to ${USERNAME_MAX_LENGTH} lowercase letters, digits, ".", "_" or "-"`
});

export const ownerPasswordRule = z
	.string({ error: 'is required' })
	.min(PASSWORD_MIN_LENGTH, { message: `must be at least ${PASSWORD_MIN_LENGTH} characters` })
	.max(PASSWORD_MAX_LENGTH, { message: `must be at most ${PASSWORD_MAX_LENGTH} characters` });

const ownerVariablesSchema = z.object({
	OWNER_USERNAME: usernameRule,
	OWNER_EMAIL: z.email({ error: 'must be a valid email address' }),
	OWNER_PASSWORD: ownerPasswordRule
});

export interface OwnerVariables {
	OWNER_USERNAME?: string;
	OWNER_EMAIL?: string;
	OWNER_PASSWORD?: string;
}

export interface Owner {
	id: string;
	name: string;
	username: string | null;
	email: string;
}

export interface Logger {
	info(message: string): void;
}

export type BootstrapResult = 'created' | 'exists';

export class OwnerError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'OwnerError';
	}
}

function hasOwnerVariables(variables: OwnerVariables): boolean {
	return (
		variables.OWNER_USERNAME !== undefined ||
		variables.OWNER_EMAIL !== undefined ||
		variables.OWNER_PASSWORD !== undefined
	);
}

/**
 * Creates the owner from the OWNER_* variables when no user exists. Once a user exists the variables
 * are ignored: they are never compared with the account or used to update it.
 */
export async function bootstrapOwner(
	db: Database,
	variables: OwnerVariables,
	logger: Logger = console
): Promise<BootstrapResult> {
	return db.transaction(async (tx) => {
		await tx.execute(sql`select pg_advisory_xact_lock(${OWNER_LOCK_KEY})`);

		const [{ total }] = await tx.select({ total: count() }).from(user);
		if (total > 0) {
			if (hasOwnerVariables(variables)) {
				logger.info(
					'An owner account exists, so OWNER_USERNAME, OWNER_EMAIL and OWNER_PASSWORD are ignored. ' +
						'They can be removed from the environment.'
				);
			}
			return 'exists';
		}

		const parsed = ownerVariablesSchema.safeParse(variables);
		if (!parsed.success) {
			const issues = parsed.error.issues.map(
				(issue) => `${issue.path.join('.')} ${issue.message}`
			);
			throw new OwnerError(
				`No owner account exists yet, so OWNER_USERNAME, OWNER_EMAIL and OWNER_PASSWORD are needed ` +
					`to create it:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`
			);
		}

		const {
			OWNER_USERNAME: username,
			OWNER_EMAIL: email,
			OWNER_PASSWORD: password
		} = parsed.data;
		const userId = randomUUID();
		const now = new Date();

		// Better Auth's own hashing, so sign in can verify the stored hash.
		const passwordHash = await hashPassword(password);

		await tx.insert(user).values({
			id: userId,
			name: username,
			email: email.toLowerCase(),
			emailVerified: true,
			username,
			displayUsername: username,
			createdAt: now,
			updatedAt: now
		});
		await tx.insert(account).values({
			id: randomUUID(),
			accountId: userId,
			providerId: CREDENTIAL_PROVIDER,
			userId,
			password: passwordHash,
			createdAt: now,
			updatedAt: now
		});

		logger.info(`Created the owner account "${username}".`);
		return 'created';
	});
}

export async function findOwner(db: Database): Promise<Owner | null> {
	const [row] = await db
		.select({ id: user.id, name: user.name, username: user.username, email: user.email })
		.from(user)
		.orderBy(user.createdAt)
		.limit(1);
	return row ?? null;
}

/** Sets a new password for the owner and signs every session out. */
export async function resetOwnerPassword(db: Database, password: string): Promise<Owner> {
	const parsedPassword = ownerPasswordRule.safeParse(password);
	if (!parsedPassword.success) {
		throw new OwnerError(`The password ${parsedPassword.error.issues[0].message}.`);
	}

	const owner = await findOwner(db);
	if (owner === null) {
		throw new OwnerError('No owner account exists yet. Start the app once to create it.');
	}

	const passwordHash = await hashPassword(parsedPassword.data);
	const now = new Date();

	await db.transaction(async (tx) => {
		const updated = await tx
			.update(account)
			.set({ password: passwordHash, updatedAt: now })
			.where(and(eq(account.userId, owner.id), eq(account.providerId, CREDENTIAL_PROVIDER)))
			.returning({ id: account.id });

		if (updated.length === 0) {
			await tx.insert(account).values({
				id: randomUUID(),
				accountId: owner.id,
				providerId: CREDENTIAL_PROVIDER,
				userId: owner.id,
				password: passwordHash,
				createdAt: now,
				updatedAt: now
			});
		}
		await tx.delete(session).where(eq(session.userId, owner.id));
	});
	return owner;
}

/**
 * Turns two factor authentication off for an owner locked out of it, and signs out every session.
 * Reports whether it was on.
 */
export async function disableOwnerTwoFactor(
	db: Database
): Promise<{ owner: Owner; wasEnabled: boolean }> {
	const owner = await findOwner(db);
	if (owner === null) {
		throw new OwnerError('No owner account exists yet. Start the app once to create it.');
	}

	const wasEnabled = await db.transaction(async (tx) => {
		const [current] = await tx
			.select({ enabled: user.twoFactorEnabled })
			.from(user)
			.where(eq(user.id, owner.id));
		await tx
			.update(user)
			.set({ twoFactorEnabled: false, updatedAt: new Date() })
			.where(eq(user.id, owner.id));
		await tx.delete(twoFactor).where(eq(twoFactor.userId, owner.id));
		await tx.delete(session).where(eq(session.userId, owner.id));
		return current?.enabled === true;
	});
	return { owner, wasEnabled };
}
