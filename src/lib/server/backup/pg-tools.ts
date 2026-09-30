import { spawn, spawnSync } from 'node:child_process';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

// pg_dump and pg_restore. The production image installs them. On a development machine without
// them, the tools of the dev compose database container are used through `docker compose exec`,
// which reaches the dev database on its own 127.0.0.1:5432.

export class BackupError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'BackupError';
	}
}

export type PgTool = 'pg_dump' | 'pg_restore';

function installed(tool: PgTool): boolean {
	return spawnSync(tool, ['--version'], { stdio: 'ignore' }).status === 0;
}

function devComposeFile(): string | null {
	const file = path.resolve(process.cwd(), 'docker-compose.dev.yml');
	return existsSync(file) ? file : null;
}

/** The command that runs a PostgreSQL client tool here. */
export function pgCommand(tool: PgTool): string[] {
	if (installed(tool)) {
		return [tool];
	}
	const compose = devComposeFile();
	if (compose !== null) {
		const running = spawnSync(
			'docker',
			['compose', '-f', compose, 'ps', '--status', 'running', '-q', 'db'],
			{
				encoding: 'utf8'
			}
		);
		if (running.status === 0 && running.stdout.trim().length > 0) {
			return ['docker', 'compose', '-f', compose, 'exec', '-T', 'db', tool];
		}
	}
	throw new BackupError(
		`${tool} is not installed. Install the PostgreSQL 17 client tools, or run the command in the app container.`
	);
}

function run(tool: PgTool, args: string[], io: { input?: string; output?: string }): Promise<void> {
	const command = pgCommand(tool);
	return new Promise((resolve, reject) => {
		const child = spawn(command[0], [...command.slice(1), ...args], {
			stdio: [
				io.input === undefined ? 'ignore' : 'pipe',
				io.output === undefined ? 'ignore' : 'pipe',
				'pipe'
			]
		});
		let errors = '';
		child.stderr?.setEncoding('utf8');
		child.stderr?.on('data', (chunk: string) => {
			errors += chunk;
		});
		const streams: Promise<void>[] = [];
		if (io.input !== undefined && child.stdin !== null) {
			streams.push(pipeline(createReadStream(io.input), child.stdin));
		}
		if (io.output !== undefined && child.stdout !== null) {
			streams.push(pipeline(child.stdout, createWriteStream(io.output)));
		}
		child.on('error', reject);
		child.on('close', (code) => {
			Promise.all(streams)
				.then(() => {
					if (code === 0) {
						resolve();
					} else {
						// Never the connection string: it holds the database password.
						reject(new BackupError(`${tool} failed: ${errors.trim().slice(0, 2000)}`));
					}
				})
				.catch(reject);
		});
	});
}

/** Dumps the database in pg_dump's custom format into `file`. */
export async function dumpDatabase(databaseUrl: string, file: string): Promise<void> {
	await run(
		'pg_dump',
		['--format=custom', '--no-owner', '--no-privileges', `--dbname=${databaseUrl}`],
		{ output: file }
	);
}

/** Restores a custom format dump into an empty database. */
export async function restoreDatabase(databaseUrl: string, file: string): Promise<void> {
	await run(
		'pg_restore',
		['--no-owner', '--no-privileges', '--exit-on-error', `--dbname=${databaseUrl}`],
		{ input: file }
	);
}
