import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { EnvError, parseEnv } from './env';

const REQUIRED = {
	ORIGIN: 'https://manifold.example',
	DATABASE_URL: 'postgres://manifold:secret@db:5432/manifold',
	BETTER_AUTH_SECRET: 'x'.repeat(32),
	ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64')
};

describe('parseEnv', () => {
	it('fills in the documented defaults', () => {
		const env = parseEnv(REQUIRED, { dev: false });

		expect(env.ORGANIZATION_NAME).toBe('Manifold');
		expect(env.SMTP_PORT).toBe(587);
		expect(env.SMTP_SECURE).toBe(false);
		expect(env.MAP_TILE_URL).toContain('tile.openstreetmap.org');
		expect(env.MAP_DEFAULT_CENTER).toEqual([0, 20]);
		expect(env.UPLOAD_DIR).toBe('/data/uploads');
		expect(env.UPLOAD_MAX_BYTES).toBe(100 * 1024 * 1024);
		expect(env.TRASH_RETENTION_DAYS).toBe(30);
		expect(env.AUDIT_RETENTION_DAYS).toBe(180);
		expect(env.API_RATE_LIMIT_PER_MINUTE).toBe(120);
	});

	it('uses the project folder for uploads in development', () => {
		expect(parseEnv(REQUIRED, { dev: true }).UPLOAD_DIR).toBe('./.data/uploads');
	});

	it('treats empty values as unset, as compose passes them', () => {
		const env = parseEnv(
			{ ...REQUIRED, ORGANIZATION_NAME: '', SMTP_HOST: '', MAP_DEFAULT_ZOOM: ' ' },
			{ dev: false }
		);

		expect(env.ORGANIZATION_NAME).toBe('Manifold');
		expect(env.SMTP_HOST).toBeUndefined();
		expect(env.MAP_DEFAULT_ZOOM).toBe(2);
	});

	it('parses typed values', () => {
		const env = parseEnv(
			{
				...REQUIRED,
				SMTP_SECURE: 'true',
				SMTP_PORT: '465',
				MAP_DEFAULT_CENTER: '28.97, 41.01',
				MAP_DEFAULT_ZOOM: '11'
			},
			{ dev: false }
		);

		expect(env.SMTP_SECURE).toBe(true);
		expect(env.SMTP_PORT).toBe(465);
		expect(env.MAP_DEFAULT_CENTER).toEqual([28.97, 41.01]);
		expect(env.MAP_DEFAULT_ZOOM).toBe(11);
	});

	it('names every missing or malformed variable without echoing values', () => {
		const secret = 'too-short-secret';

		try {
			parseEnv(
				{
					ORIGIN: 'https://manifold.example/',
					DATABASE_URL: 'mysql://nope',
					BETTER_AUTH_SECRET: secret,
					ENCRYPTION_KEY: 'c2hvcnQ=',
					MAP_DEFAULT_CENTER: '200,10'
				},
				{ dev: false }
			);
			expect.unreachable();
		} catch (error) {
			expect(error).toBeInstanceOf(EnvError);
			const message = (error as Error).message;
			for (const name of [
				'ORIGIN',
				'DATABASE_URL',
				'BETTER_AUTH_SECRET',
				'ENCRYPTION_KEY',
				'MAP_DEFAULT_CENTER'
			]) {
				expect(message).toContain(name);
			}
			expect(message).not.toContain(secret);
			expect(message).not.toContain('mysql://nope');
		}
	});

	it('requires the core variables', () => {
		expect(() => parseEnv({}, { dev: false })).toThrow(/ORIGIN[\s\S]*DATABASE_URL/);
	});

	it('reads secrets from files named by the _FILE variables', () => {
		const folder = mkdtempSync(path.join(tmpdir(), 'manifold-env-'));
		const secretFile = path.join(folder, 'auth-secret');
		writeFileSync(secretFile, `${'y'.repeat(40)}\n`);
		const rest: Record<string, string> = { ...REQUIRED };
		delete rest.BETTER_AUTH_SECRET;

		const env = parseEnv({ ...rest, BETTER_AUTH_SECRET_FILE: secretFile }, { dev: false });
		expect(env.BETTER_AUTH_SECRET).toBe('y'.repeat(40));

		expect(() =>
			parseEnv({ ...REQUIRED, BETTER_AUTH_SECRET_FILE: secretFile }, { dev: false })
		).toThrow(/either BETTER_AUTH_SECRET or BETTER_AUTH_SECRET_FILE/);
		expect(() =>
			parseEnv(
				{ ...rest, BETTER_AUTH_SECRET_FILE: path.join(folder, 'missing') },
				{ dev: false }
			)
		).toThrow(/BETTER_AUTH_SECRET_FILE: The file cannot be read/);
	});

	it('refuses the example database password on a public address', () => {
		const example = 'postgres://manifold:change-me@db:5432/manifold';
		expect(() => parseEnv({ ...REQUIRED, DATABASE_URL: example }, { dev: false })).toThrow(
			/example database password/
		);
		expect(
			parseEnv(
				{ ...REQUIRED, ORIGIN: 'http://localhost:3000', DATABASE_URL: example },
				{ dev: false }
			).DATABASE_URL
		).toBe(example);
	});
});
