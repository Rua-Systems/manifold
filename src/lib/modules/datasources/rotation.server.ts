import type { Transaction } from '$lib/server/db';
import { EncryptionKeyError, seal, unseal } from '$lib/server/sealing';
import { eq } from 'drizzle-orm';
import { dataSource } from './schema.server';

// ENCRYPTION_KEY rotation for the secrets of data sources, inside the CLI's transaction that also
// rotates the vault, so nothing is ever half rotated.

export async function reencryptDataSources(
	tx: Transaction,
	oldKey: Buffer,
	newKey: Buffer
): Promise<{ count: number; keyVersion: number }> {
	const rows = await tx.select().from(dataSource).for('update');
	const keyVersion = rows.reduce((highest, row) => Math.max(highest, row.keyVersion), 0) + 1;

	for (const row of rows) {
		let value: string;
		try {
			value = unseal(row, row.id, oldKey);
		} catch {
			throw new EncryptionKeyError(
				'The current ENCRYPTION_KEY does not open the secrets of every data source. Nothing was changed.'
			);
		}
		await tx
			.update(dataSource)
			.set({ ...seal(value, row.id, newKey), keyVersion })
			.where(eq(dataSource.id, row.id));
	}
	return { count: rows.length, keyVersion };
}
