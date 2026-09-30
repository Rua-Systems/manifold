import { hashPassword as hashLegacyPassword } from 'better-auth/crypto';
import { count, eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { withIsolatedSchema } from '../../../tests/integration/isolated-schema';
import type { Connection } from './db';
import { defaultMigrationsDirectory, runMigrations } from './db/migrate';
import { account, session, user } from './db/schema';
import {
	bootstrapOwner,
	findOwner,
	OwnerError,
	resetOwnerPassword,
	upgradeOwnerPasswordHash
} from './owner';
import { verifyPassword } from './passwords/hash';

const VARIABLES = {
	OWNER_USERNAME: 'keeper',
	OWNER_EMAIL: 'Keeper@Example.test',
	OWNER_PASSWORD: 'long enough password'
};

function quietLogger() {
	return { info: vi.fn() };
}

async function migrated(test: (connection: Connection) => Promise<void>): Promise<void> {
	await withIsolatedSchema(async (connection) => {
		await runMigrations(connection.sql, defaultMigrationsDirectory());
		await test(connection);
	});
}

describe('bootstrapOwner', () => {
	it('creates the owner once from the environment', async () => {
		await migrated(async ({ db }) => {
			const logger = quietLogger();

			expect(await bootstrapOwner(db, VARIABLES, logger)).toBe('created');
			expect(await bootstrapOwner(db, VARIABLES, logger)).toBe('exists');

			const [{ total }] = await db.select({ total: count() }).from(user);
			expect(total).toBe(1);

			const owner = await findOwner(db);
			expect(owner).toMatchObject({ username: 'keeper', email: 'keeper@example.test' });

			const [credential] = await db
				.select({ password: account.password, providerId: account.providerId })
				.from(account);
			expect(credential.providerId).toBe('credential');
			expect(await verifyPassword(credential.password ?? '', VARIABLES.OWNER_PASSWORD)).toBe(
				true
			);
		});
	});

	it('refuses to start without valid owner variables when no user exists', async () => {
		await migrated(async ({ db }) => {
			const logger = quietLogger();

			await expect(bootstrapOwner(db, {}, logger)).rejects.toThrow(OwnerError);
			await expect(
				bootstrapOwner(db, { ...VARIABLES, OWNER_USERNAME: 'Not Valid' }, logger)
			).rejects.toThrow(/OWNER_USERNAME/);
			await expect(
				bootstrapOwner(db, { ...VARIABLES, OWNER_EMAIL: 'nope' }, logger)
			).rejects.toThrow(/OWNER_EMAIL/);
			await expect(
				bootstrapOwner(db, { ...VARIABLES, OWNER_PASSWORD: 'short' }, logger)
			).rejects.toThrow(/OWNER_PASSWORD/);
			await expect(
				bootstrapOwner(db, { ...VARIABLES, OWNER_PASSWORD: 'qwertyuiop' }, logger)
			).rejects.toThrow(/OWNER_PASSWORD is a common password/);

			const [{ total }] = await db.select({ total: count() }).from(user);
			expect(total).toBe(0);
		});
	});

	it('ignores the variables once a user exists and says they can go', async () => {
		await migrated(async ({ db }) => {
			await bootstrapOwner(db, VARIABLES, quietLogger());
			const logger = quietLogger();

			const result = await bootstrapOwner(
				db,
				{
					OWNER_USERNAME: 'someone',
					OWNER_EMAIL: 'other@example.test',
					OWNER_PASSWORD: 'x'
				},
				logger
			);

			expect(result).toBe('exists');
			expect(await findOwner(db)).toMatchObject({ username: 'keeper' });
			expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('can be removed'));
		});
	});

	it('stays silent about the variables when they are not set', async () => {
		await migrated(async ({ db }) => {
			await bootstrapOwner(db, VARIABLES, quietLogger());
			const logger = quietLogger();

			await bootstrapOwner(db, {}, logger);
			expect(logger.info).not.toHaveBeenCalled();
		});
	});
});

describe('resetOwnerPassword', () => {
	it('replaces the password and signs every session out', async () => {
		await migrated(async ({ db }) => {
			await bootstrapOwner(db, VARIABLES, quietLogger());
			const owner = await findOwner(db);
			if (owner === null) {
				throw new Error('owner missing');
			}
			await db.insert(session).values({
				id: 'session-1',
				token: 'token-1',
				userId: owner.id,
				expiresAt: new Date(Date.now() + 60_000)
			});

			await resetOwnerPassword(db, 'a brand new password');

			const [credential] = await db
				.select({ password: account.password })
				.from(account)
				.where(eq(account.userId, owner.id));
			expect(await verifyPassword(credential.password ?? '', 'a brand new password')).toBe(
				true
			);
			const [{ total }] = await db.select({ total: count() }).from(session);
			expect(total).toBe(0);
		});
	});

	it('rejects a password that is too short', async () => {
		await migrated(async ({ db }) => {
			await bootstrapOwner(db, VARIABLES, quietLogger());

			await expect(resetOwnerPassword(db, 'short')).rejects.toThrow(/at least 8/);
			await expect(resetOwnerPassword(db, 'qwertyuiop')).rejects.toThrow(/common password/);
			await expect(resetOwnerPassword(db, 'the manifold of mine')).rejects.toThrow(
				/must not contain/
			);
		});
	});
});

describe('upgradeOwnerPasswordHash', () => {
	it('replaces a hash of earlier parameters and keeps the password', async () => {
		await migrated(async ({ db }) => {
			await bootstrapOwner(db, VARIABLES, quietLogger());
			await db
				.update(account)
				.set({ password: await hashLegacyPassword(VARIABLES.OWNER_PASSWORD) });

			await upgradeOwnerPasswordHash(db, VARIABLES.OWNER_PASSWORD);

			const [credential] = await db.select({ password: account.password }).from(account);
			expect(credential.password).toMatch(/^\$scrypt\$ln=15,r=8,p=3\$/);
			expect(await verifyPassword(credential.password ?? '', VARIABLES.OWNER_PASSWORD)).toBe(
				true
			);
		});
	});
});
