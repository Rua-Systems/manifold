import type { Database, Transaction } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { seal, unseal, VaultKeyError } from './crypto.server';
import { vaultSecret } from './schema.server';

// ENCRYPTION_KEY rotation for the CLI: every value is decrypted with the old key and encrypted with
// the new one in a single transaction, so the vault is never half rotated. The CLI runs it in the
// same transaction as the data sources' rotation.

export async function reencryptVaultSecrets(
	tx: Transaction,
	oldKey: Buffer,
	newKey: Buffer
): Promise<{ count: number; keyVersion: number }> {
	const rows = await tx.select().from(vaultSecret).for('update');
	const keyVersion = rows.reduce((highest, row) => Math.max(highest, row.keyVersion), 0) + 1;

	for (const row of rows) {
		let value: string;
		try {
			value = unseal(row, row.id, oldKey);
		} catch {
			throw new VaultKeyError(
				'The current ENCRYPTION_KEY does not open every value. Nothing was changed.'
			);
		}
		const sealed = seal(value, row.id, newKey);
		await tx
			.update(vaultSecret)
			.set({ ...sealed, keyVersion })
			.where(eq(vaultSecret.id, row.id));
	}
	return { count: rows.length, keyVersion };
}

/** The vault alone, in a transaction of its own. */
export async function rotateVaultKey(
	db: Database,
	oldKey: Buffer,
	newKey: Buffer
): Promise<{ count: number; keyVersion: number }> {
	return db.transaction((tx) => reencryptVaultSecrets(tx, oldKey, newKey));
}
