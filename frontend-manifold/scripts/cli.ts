import { connect, type Connection } from '$lib/server/db';
import { defaultMigrationsDirectory, MigrationError, runMigrations } from '$lib/server/db/migrate';
import { EnvError, parseEnv } from '$lib/server/env';
import { parseVaultKey, VaultKeyError } from '$lib/modules/vault/crypto.server';
import { rotateVaultKey } from '$lib/modules/vault/rotation.server';
import { recordAudit } from '$lib/server/audit';
import {
	disableOwnerTwoFactor,
	findOwner,
	OwnerError,
	resetOwnerPassword
} from '$lib/server/owner';
import { createInterface } from 'node:readline';

// Bundled into build-cli/cli.js and shipped as /app/cli.js. It must only import plain modules that
// do not depend on SvelteKit, because it runs outside the app.

const USAGE = `Usage: node cli.js <command>

Commands:
  migrate                 Apply pending database migrations.
  owner:show              Print the owner's username and email.
  owner:reset-password    Set a new owner password and sign out every session.
  owner:disable-2fa       Turn two factor authentication off and sign out every session.
  vault:rotate-key        Re-encrypt the vault with a new ENCRYPTION_KEY, taken from
                          NEW_ENCRYPTION_KEY or asked for.`;

class CancelledError extends Error {}

/** CLI commands act as themselves in the audit log. */
const CLI_ACTOR = { type: 'cli', id: null } as const;

/** Reads a line without echoing it when attached to a terminal; piped input is read as is. */
function promptHidden(question: string): Promise<string> {
	const input = process.stdin;
	if (!input.isTTY) {
		return promptLine(question);
	}

	return new Promise((resolve, reject) => {
		let value = '';

		function finish(): void {
			input.off('data', onData);
			input.setRawMode(false);
			input.pause();
			process.stdout.write('\n');
		}

		function onData(chunk: string): void {
			for (const character of chunk) {
				if (character === '\r' || character === '\n') {
					finish();
					resolve(value);
					return;
				}
				if (character === '\u0003') {
					finish();
					reject(new CancelledError('Cancelled.'));
					return;
				}
				if (character === '\u007f' || character === '\b') {
					value = value.slice(0, -1);
				} else {
					value += character;
				}
			}
		}

		process.stdout.write(question);
		input.setRawMode(true);
		input.setEncoding('utf8');
		input.resume();
		input.on('data', onData);
	});
}

// Piped input may hold several answers, so one reader serves every prompt.
let lineReader: AsyncIterator<string> | undefined;

async function promptLine(question: string): Promise<string> {
	process.stdout.write(question);
	if (lineReader === undefined) {
		lineReader = createInterface({ input: process.stdin, terminal: false })[
			Symbol.asyncIterator
		]();
	}
	const next = await lineReader.next();
	process.stdout.write('\n');
	if (next.done === true) {
		throw new CancelledError('No input.');
	}
	return next.value;
}

async function migrate(connection: Connection): Promise<void> {
	const applied = await runMigrations(connection.sql, defaultMigrationsDirectory());
	if (applied.length === 0) {
		console.log('The database is up to date.');
		return;
	}
	for (const fileName of applied) {
		console.log(`Applied ${fileName}`);
	}
	await recordAudit(
		{ actor: CLI_ACTOR, action: 'database.migrate', metadata: { applied } },
		connection.db
	);
}

async function showOwner(connection: Connection): Promise<void> {
	const owner = await findOwner(connection.db);
	if (owner === null) {
		throw new OwnerError('No owner account exists yet. Start the app once to create it.');
	}
	console.log(`Username: ${owner.username ?? '(none)'}`);
	console.log(`Email:    ${owner.email}`);
}

async function resetPassword(connection: Connection): Promise<void> {
	const password = await promptHidden('New password: ');
	const repeated = await promptHidden('Repeat the new password: ');
	if (password !== repeated) {
		throw new OwnerError('The passwords do not match. Nothing was changed.');
	}

	const owner = await resetOwnerPassword(connection.db, password);
	await recordAudit(
		{ actor: CLI_ACTOR, action: 'auth.password_reset', target: { type: 'user', id: owner.id } },
		connection.db
	);
	console.log(`The password of "${owner.username ?? owner.email}" was changed.`);
	console.log('Every session was signed out.');
}

async function disableTwoFactor(connection: Connection): Promise<void> {
	const owner = await findOwner(connection.db);
	if (owner === null) {
		throw new OwnerError('No owner account exists yet. Start the app once to create it.');
	}
	const answer = await promptLine(
		`Turn two factor authentication off for "${owner.username ?? owner.email}" and sign out every session? Type "yes" to continue: `
	);
	if (answer.trim().toLowerCase() !== 'yes') {
		throw new CancelledError('Nothing was changed.');
	}

	const { wasEnabled } = await disableOwnerTwoFactor(connection.db);
	await recordAudit(
		{
			actor: CLI_ACTOR,
			action: 'auth.two_factor_disable',
			target: { type: 'user', id: owner.id }
		},
		connection.db
	);
	console.log(
		wasEnabled
			? 'Two factor authentication is off. Sign in with the password and turn it on again in Settings.'
			: 'Two factor authentication was already off.'
	);
	console.log('Every session was signed out.');
}

async function rotateKey(connection: Connection, currentKey: string): Promise<void> {
	const oldKey = parseVaultKey(currentKey);
	const fromEnvironment = process.env.NEW_ENCRYPTION_KEY?.trim() ?? '';
	const newKey = parseVaultKey(
		fromEnvironment.length > 0
			? fromEnvironment
			: await promptHidden('New key (32 random bytes, base64): ')
	);
	if (newKey.equals(oldKey)) {
		throw new VaultKeyError('The new key is the current one. Nothing was changed.');
	}

	const { count, keyVersion } = await rotateVaultKey(connection.db, oldKey, newKey);
	await recordAudit(
		{
			actor: CLI_ACTOR,
			action: 'vault.rotate_key',
			metadata: { count, key_version: keyVersion }
		},
		connection.db
	);
	console.log(`Re-encrypted ${count} value(s) with the new key (key version ${keyVersion}).`);
	console.log('Now:');
	console.log('  1. Set ENCRYPTION_KEY to the new key where the app reads it (.env or Coolify).');
	console.log('  2. Restart the app.');
	console.log('Until the restart the running app holds the old key and cannot read the vault.');
	console.log('Keep the old key until the restart is done, then discard it.');
}

async function run(command: string): Promise<void> {
	const env = parseEnv(process.env, { dev: process.env.NODE_ENV !== 'production' });
	const connection = connect(env.DATABASE_URL, { max: 2 });

	try {
		switch (command) {
			case 'migrate':
				await migrate(connection);
				break;
			case 'owner:show':
				await showOwner(connection);
				break;
			case 'owner:reset-password':
				await resetPassword(connection);
				break;
			case 'owner:disable-2fa':
				await disableTwoFactor(connection);
				break;
			case 'vault:rotate-key':
				await rotateKey(connection, env.ENCRYPTION_KEY);
				break;
		}
	} finally {
		await connection.sql.end();
	}
}

const COMMANDS = new Set([
	'migrate',
	'owner:show',
	'owner:reset-password',
	'owner:disable-2fa',
	'vault:rotate-key'
]);

async function main(): Promise<number> {
	const [command] = process.argv.slice(2);
	if (command === undefined || command === 'help' || command === '--help') {
		console.log(USAGE);
		return 0;
	}
	if (!COMMANDS.has(command)) {
		console.error(`Unknown command "${command}".\n\n${USAGE}`);
		return 1;
	}

	try {
		await run(command);
		return 0;
	} catch (error) {
		const expected =
			error instanceof EnvError ||
			error instanceof MigrationError ||
			error instanceof OwnerError ||
			error instanceof VaultKeyError ||
			error instanceof CancelledError;
		if (expected) {
			console.error(error.message);
		} else {
			console.error(error);
		}
		return 1;
	}
}

process.exitCode = await main();
