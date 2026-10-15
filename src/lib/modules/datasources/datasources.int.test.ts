import { getDb } from '$lib/server/db';
import { getEnv } from '$lib/server/env';
import { NotFoundError, ValidationError } from '$lib/server/errors';
import { parseEncryptionKey, unseal } from '$lib/server/sealing';
import { eq } from 'drizzle-orm';
import http from 'node:http';
import net from 'node:net';
import { randomBytes } from 'node:crypto';
import { Server as SshServer, utils as sshUtils } from 'ssh2';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { testDatabaseUrl } from '../../../../tests/support/test-database';
import { testDataSource } from './connect.server';
import {
	changesSecrets,
	createDataSource,
	deleteDataSource,
	getDataSource,
	listDataSources,
	revealDataSource,
	searchDataSources,
	updateDataSource
} from './datasources.server';
import { encodeCommand, parseReply, type RespReply } from './resp';
import { reencryptDataSources } from './rotation.server';
import { dataSource } from './schema.server';
import type { DatabaseSettings, SshSettings } from './types';

// The connection tests run against real servers on 127.0.0.1: the test database itself, an SSH
// server and small Redis and HTTP servers started here. Nothing leaves the machine.

const database = new URL(testDatabaseUrl());
const DB = {
	host: database.hostname,
	port: Number(database.port),
	database: database.pathname.slice(1),
	username: decodeURIComponent(database.username),
	password: decodeURIComponent(database.password)
};

async function refusal(work: Promise<unknown>): Promise<Record<string, string | undefined>> {
	try {
		await work;
	} catch (error) {
		if (error instanceof ValidationError) {
			return error.fields;
		}
		throw error;
	}
	throw new Error('Expected a refusal.');
}

function postgresSource(
	name: string,
	settings: Partial<DatabaseSettings> = {},
	password = DB.password
) {
	return createDataSource({
		name,
		type: 'postgresql',
		settings: {
			host: DB.host,
			port: DB.port,
			database: DB.database,
			username: DB.username,
			...settings
		},
		secrets: { password }
	});
}

function listen(server: net.Server): Promise<number> {
	return new Promise((resolve) => {
		server.listen(0, '127.0.0.1', () => resolve((server.address() as net.AddressInfo).port));
	});
}

beforeEach(async () => {
	await getDb().delete(dataSource);
});

describe('data sources', () => {
	it('keeps the settings in the open and the secrets sealed', async () => {
		const created = await postgresSource('Shop database', {}, 'hunter2-db');
		expect(created).toMatchObject({
			name: 'Shop database',
			type: 'postgresql',
			description: '',
			docsUrl: null,
			secrets: ['password'],
			lastTest: null
		});
		expect(created.settings).toMatchObject({ host: DB.host, ssl: 'disable' });
		expect(JSON.stringify(created)).not.toContain('hunter2-db');

		const [row] = await getDb().select().from(dataSource).where(eq(dataSource.id, created.id));
		expect(row.ciphertext.toString('utf8')).not.toContain('hunter2-db');
		expect(JSON.stringify(row.settings)).not.toContain('hunter2-db');
		const key = parseEncryptionKey(getEnv().ENCRYPTION_KEY);
		expect(JSON.parse(unseal(row, row.id, key))).toEqual({ password: 'hunter2-db' });
		// The ciphertext is bound to its row.
		expect(() => unseal(row, crypto.randomUUID(), key)).toThrow();

		expect(await revealDataSource(created.id)).toEqual({
			secrets: { password: 'hunter2-db' },
			connectionUrl: `postgresql://${encodeURIComponent(DB.username)}:hunter2-db@${DB.host}:${DB.port}/${DB.database}?sslmode=disable`
		});
	});

	it('refuses bad input with every field named, and a name taken whatever its case', async () => {
		expect(
			await refusal(
				createDataSource({
					name: '',
					type: 'mysql',
					docsUrl: 'ftp://docs',
					settings: {
						host: 'http://db',
						port: 99999,
						username: '',
						ssh: { enabled: true }
					}
				})
			)
		).toMatchObject({
			name: expect.any(String),
			docsUrl: expect.any(String),
			host: expect.any(String),
			port: expect.any(String),
			username: expect.any(String),
			'ssh.host': expect.any(String),
			'ssh.username': expect.any(String)
		});
		expect(
			await refusal(createDataSource({ name: 'X', type: 'oracle', settings: {} }))
		).toEqual({
			type: 'Choose a type.'
		});

		await postgresSource('Analytics');
		expect(await refusal(postgresSource('ANALYTICS'))).toEqual({
			name: 'A data source already has this name.'
		});
	});

	it('drops the secrets a type cannot use', async () => {
		const created = await createDataSource({
			name: 'CDN file',
			type: 'link',
			settings: { url: 'https://cdn.example.com/a.json', auth: 'bearer' },
			secrets: { token: 'cdn-token', password: 'not for links' }
		});
		expect(created.secrets).toEqual(['token']);
		expect((await revealDataSource(created.id)).secrets).toEqual({ token: 'cdn-token' });
	});

	it('replaces the settings, merges the secrets and keeps the type', async () => {
		const created = await createDataSource({
			name: 'Partner API',
			type: 'api',
			settings: { baseUrl: 'https://api.example.com', auth: 'basic', username: 'me' },
			secrets: { password: 'one', token: 'two' }
		});
		const updated = await updateDataSource(created.id, {
			name: 'Partner API v2',
			description: 'Ask Ada for access.',
			docsUrl: 'https://docs.example.com',
			settings: { baseUrl: 'https://api.example.com/v2', auth: 'bearer' },
			secrets: { password: null, token: '' }
		});
		expect(updated).toMatchObject({
			name: 'Partner API v2',
			type: 'api',
			description: 'Ask Ada for access.',
			docsUrl: 'https://docs.example.com',
			secrets: ['token']
		});
		expect(updated.settings).toMatchObject({
			baseUrl: 'https://api.example.com/v2',
			auth: 'bearer'
		});
		expect((await revealDataSource(created.id)).secrets).toEqual({ token: 'two' });

		await updateDataSource(created.id, {
			name: 'Partner API v2',
			settings: updated.settings,
			secrets: { token: 'three' }
		});
		expect((await revealDataSource(created.id)).secrets).toEqual({ token: 'three' });
		expect(changesSecrets({ token: 'x' })).toBe(true);
		expect(changesSecrets({ token: null })).toBe(true);
		expect(changesSecrets({ token: '' })).toBe(false);
		expect(changesSecrets({})).toBe(false);
	});

	it('lists by name, filters by type and words, finds by name and deletes', async () => {
		await postgresSource('Zeta warehouse');
		await createDataSource({
			name: 'alpha cache',
			type: 'redis',
			description: 'Sessions live here',
			settings: { host: 'cache.internal' }
		});
		expect((await listDataSources()).map((item) => item.name)).toEqual([
			'alpha cache',
			'Zeta warehouse'
		]);
		expect((await listDataSources({ type: 'redis' })).map((item) => item.name)).toEqual([
			'alpha cache'
		]);
		expect((await listDataSources({ query: 'sessions' })).map((item) => item.name)).toEqual([
			'alpha cache'
		]);
		expect(
			(await listDataSources({ query: 'cache.internal' })).map((item) => item.name)
		).toEqual(['alpha cache']);
		const hits = await searchDataSources('warehous', 5);
		expect(hits.map((hit) => hit.name)).toEqual(['Zeta warehouse']);

		const [first] = await listDataSources();
		await deleteDataSource(first.id);
		await expect(getDataSource(first.id)).rejects.toBeInstanceOf(NotFoundError);
		await expect(getDataSource('nope')).rejects.toBeInstanceOf(NotFoundError);
	});

	it('moves the secrets to a new key with the rotation', async () => {
		const created = await postgresSource('Rotated', {}, 'kept-across');
		const oldKey = parseEncryptionKey(getEnv().ENCRYPTION_KEY);
		const newKey = randomBytes(32);
		const result = await getDb().transaction((tx) => reencryptDataSources(tx, oldKey, newKey));
		expect(result).toEqual({ count: 1, keyVersion: 2 });
		const [row] = await getDb().select().from(dataSource).where(eq(dataSource.id, created.id));
		expect(JSON.parse(unseal(row, row.id, newKey))).toEqual({ password: 'kept-across' });
		await expect(
			getDb().transaction((tx) => reencryptDataSources(tx, randomBytes(32), oldKey))
		).rejects.toThrow(/does not open/);
		// Back to the key the app runs with.
		await getDb().transaction((tx) => reencryptDataSources(tx, newKey, oldKey));
		expect((await revealDataSource(created.id)).secrets.password).toBe('kept-across');
	});
});

describe('connection tests', () => {
	it('connects to PostgreSQL and keeps the outcome', async () => {
		const created = await postgresSource('Test database');
		const outcome = await testDataSource(created.id);
		expect(outcome.ok).toBe(true);
		expect(outcome.message).toMatch(/^PostgreSQL \d+/);
		expect((await getDataSource(created.id)).lastTest).toMatchObject({ ok: true });

		const wrong = await postgresSource('Wrong password', {}, 'not-the-password');
		const refused = await testDataSource(wrong.id);
		expect(refused.ok).toBe(false);
		expect(refused.message).toMatch(/password authentication failed/);
		expect((await getDataSource(wrong.id)).lastTest).toMatchObject({ ok: false });
	});

	it('reports a closed port and an unknown host', async () => {
		const closed = net.createServer();
		const port = await listen(closed);
		await new Promise<void>((resolve) => closed.close(() => resolve()));
		const refused = await postgresSource('Closed', { host: '127.0.0.1', port });
		expect(await testDataSource(refused.id)).toMatchObject({
			ok: false,
			message: 'The connection was refused.'
		});
		const unknown = await createDataSource({
			name: 'Nowhere',
			type: 'mysql',
			settings: { host: 'host.invalid', username: 'root' }
		});
		expect(await testDataSource(unknown.id)).toMatchObject({
			ok: false,
			message: 'The host name was not found.'
		});
	});

	describe('through an SSH tunnel', () => {
		const clientKeys = sshUtils.generateKeyPairSync('ed25519');
		let sshPort = 0;
		let server: SshServer;
		let hostKey = sshUtils.generateKeyPairSync('ed25519').private;

		function startServer(): Promise<number> {
			server = new SshServer({ hostKeys: [hostKey] }, (client) => {
				client.on('authentication', (context) => {
					if (context.username !== 'tunnel') {
						context.reject();
						return;
					}
					if (context.method === 'password' && context.password === 'ssh-pass') {
						context.accept();
						return;
					}
					if (context.method === 'publickey') {
						const allowed = sshUtils.parseKey(clientKeys.public);
						if (
							!(allowed instanceof Error) &&
							context.key.data.equals(allowed.getPublicSSH()) &&
							(context.signature === undefined ||
								allowed.verify(
									context.blob as Buffer,
									context.signature,
									context.hashAlgo
								))
						) {
							context.accept();
							return;
						}
					}
					context.reject(['password', 'publickey']);
				});
				client.on('ready', () => {
					client.on('tcpip', (accept, _reject, info) => {
						const stream = accept();
						const socket = net.connect(info.destPort, info.destIP);
						stream.pipe(socket).pipe(stream);
						socket.on('error', () => stream.end());
					});
				});
				client.on('error', () => {});
			});
			return new Promise((resolve) => {
				server.listen(sshPort, '127.0.0.1', () => {
					resolve((server.address() as net.AddressInfo).port);
				});
			});
		}

		beforeAll(async () => {
			sshPort = await startServer();
		});

		afterAll(() => {
			server.close();
		});

		function tunnelled(
			name: string,
			ssh: Partial<SshSettings>,
			secrets: Record<string, string>
		) {
			return createDataSource({
				name,
				type: 'postgresql',
				settings: {
					host: DB.host,
					port: DB.port,
					database: DB.database,
					username: DB.username,
					ssh: {
						enabled: true,
						host: '127.0.0.1',
						port: sshPort,
						username: 'tunnel',
						...ssh
					}
				},
				secrets: { password: DB.password, ...secrets }
			});
		}

		it('connects with a password, then trusts and checks the host key', async () => {
			const created = await tunnelled('Behind SSH', {}, { sshPassword: 'ssh-pass' });
			const outcome = await testDataSource(created.id);
			expect(outcome).toMatchObject({ ok: true });
			const trusted = ((await getDataSource(created.id)).settings as DatabaseSettings).ssh
				.fingerprint;
			expect(trusted).toMatch(/^SHA256:[A-Za-z0-9+/]{43}$/);

			// The same server again is fine.
			expect((await testDataSource(created.id)).ok).toBe(true);

			// Another host key on the same address is what a man in the middle would show.
			server.close();
			hostKey = sshUtils.generateKeyPairSync('ed25519').private;
			await startServer();
			const changed = await testDataSource(created.id);
			expect(changed.ok).toBe(false);
			expect(changed.message).toContain('The SSH host key changed');
			expect(
				((await getDataSource(created.id)).settings as DatabaseSettings).ssh.fingerprint
			).toBe(trusted);

			// Pointing the tunnel elsewhere forgets the old key.
			const moved = await updateDataSource(created.id, {
				name: 'Behind SSH',
				settings: {
					...(created.settings as DatabaseSettings),
					ssh: {
						...(created.settings as DatabaseSettings).ssh,
						host: 'localhost'
					}
				}
			});
			expect((moved.settings as DatabaseSettings).ssh.fingerprint).toBe('');
		});

		it('connects with a private key', async () => {
			const created = await tunnelled(
				'Key tunnel',
				{ auth: 'key' },
				{ sshPrivateKey: clientKeys.private }
			);
			expect(await testDataSource(created.id)).toMatchObject({ ok: true });
		});

		it('reports a refused SSH sign in', async () => {
			const created = await tunnelled('Bad tunnel', {}, { sshPassword: 'wrong' });
			const outcome = await testDataSource(created.id);
			expect(outcome.ok).toBe(false);
			expect(outcome.message).toMatch(/authentication/i);
			expect(
				((await getDataSource(created.id)).settings as DatabaseSettings).ssh.fingerprint
			).toBe('');
		});
	});

	it('talks to Redis with a password and a database number', async () => {
		const received: string[][] = [];
		const server = net.createServer((socket) => {
			let buffer = Buffer.alloc(0);
			let authed = false;
			socket.on('data', (chunk) => {
				buffer = Buffer.concat([buffer, chunk]);
				let parsed = parseReply(buffer);
				while (parsed !== null) {
					buffer = buffer.subarray(parsed.end);
					const command = (parsed.reply as RespReply[]).map(String);
					received.push(command);
					let answer = '+OK\r\n';
					if (command[0] === 'AUTH') {
						authed = command[command.length - 1] === 'redis-pass';
						if (!authed) {
							answer = '-WRONGPASS invalid username-password pair\r\n';
						}
					} else if (!authed) {
						answer = '-NOAUTH Authentication required.\r\n';
					} else if (command[0] === 'PING') {
						answer = '+PONG\r\n';
					} else if (command[0] === 'INFO') {
						const info = '# Server\r\nredis_version:7.2.4\r\n';
						answer = `$${Buffer.byteLength(info)}\r\n${info}\r\n`;
					}
					socket.write(answer);
					parsed = null;
					if (buffer.length > 0) {
						parsed = parseReply(buffer);
					}
				}
			});
		});
		const port = await listen(server);
		try {
			const created = await createDataSource({
				name: 'Queue',
				type: 'redis',
				settings: { host: '127.0.0.1', port, username: 'worker', database: 3 },
				secrets: { password: 'redis-pass' }
			});
			expect(await testDataSource(created.id)).toMatchObject({
				ok: true,
				message: 'Redis 7.2.4'
			});
			expect(received).toEqual([
				['AUTH', 'worker', 'redis-pass'],
				['SELECT', '3'],
				['PING'],
				['INFO', 'server']
			]);
			expect(encodeCommand(['PING']).toString()).toBe('*1\r\n$4\r\nPING\r\n');

			await updateDataSource(created.id, {
				name: 'Queue',
				settings: created.settings,
				secrets: { password: 'wrong' }
			});
			expect(await testDataSource(created.id)).toMatchObject({
				ok: false,
				message: 'WRONGPASS invalid username-password pair'
			});
		} finally {
			server.close();
		}
	});

	describe('over HTTP', () => {
		let server: http.Server;
		let base = '';
		const seen: { method: string; url: string; headers: http.IncomingHttpHeaders }[] = [];

		beforeAll(async () => {
			server = http.createServer((request, response) => {
				seen.push({
					method: request.method ?? '',
					url: request.url ?? '',
					headers: request.headers
				});
				const url = request.url ?? '';
				if (url.startsWith('/api/health')) {
					const ok = request.headers.authorization === 'Bearer api-token';
					response.writeHead(ok ? 200 : 401, { 'content-type': 'application/json' });
					response.end('{}');
					return;
				}
				if (url.startsWith('/keyed')) {
					response.writeHead(request.headers['x-api-key'] === 'k-1' ? 204 : 403);
					response.end();
					return;
				}
				if (url === '/files/data.json') {
					if (request.method === 'HEAD') {
						response.writeHead(405);
						response.end();
						return;
					}
					response.writeHead(206, { 'content-type': 'application/json' });
					response.end('{');
					return;
				}
				if (url.startsWith('/other/')) {
					response.writeHead(403, { 'content-type': 'application/xml' });
					response.end(
						'<Error><Code>AccessDenied</Code><Message>Access Denied</Message></Error>'
					);
					return;
				}
				if (url.startsWith('/media/')) {
					const signed = (request.headers.authorization ?? '').startsWith(
						'AWS4-HMAC-SHA256 Credential=AKIATEST/'
					);
					if (!signed || !url.includes('list-type=2')) {
						response.writeHead(403, { 'content-type': 'application/xml' });
						response.end(
							'<Error><Code>AccessDenied</Code><Message>Access Denied</Message></Error>'
						);
						return;
					}
					response.writeHead(200, { 'content-type': 'application/xml' });
					response.end('<ListBucketResult><KeyCount>1</KeyCount></ListBucketResult>');
					return;
				}
				response.writeHead(404);
				response.end();
			});
			base = `http://127.0.0.1:${await listen(server)}`;
		});

		afterAll(() => {
			server.close();
		});

		it('reads the test path of an API with its token', async () => {
			const created = await createDataSource({
				name: 'Internal API',
				type: 'api',
				settings: { baseUrl: `${base}/api`, auth: 'bearer', testPath: '/health' },
				secrets: { token: 'api-token' }
			});
			expect(await testDataSource(created.id)).toMatchObject({
				ok: true,
				message: 'HTTP 200 OK'
			});
			expect(seen.at(-1)?.url).toBe('/api/health');

			await updateDataSource(created.id, {
				name: 'Internal API',
				settings: created.settings,
				secrets: { token: 'stale' }
			});
			expect(await testDataSource(created.id)).toMatchObject({
				ok: false,
				message: 'HTTP 401 Unauthorized'
			});

			const keyed = await createDataSource({
				name: 'Keyed API',
				type: 'api',
				settings: { baseUrl: `${base}/keyed`, auth: 'header', headerName: 'X-Api-Key' },
				secrets: { token: 'k-1' }
			});
			expect(await testDataSource(keyed.id)).toMatchObject({ ok: true });
		});

		it('falls back to a ranged GET when a link refuses HEAD', async () => {
			const created = await createDataSource({
				name: 'Data file',
				type: 'link',
				settings: { url: `${base}/files/data.json` }
			});
			expect(await testDataSource(created.id)).toMatchObject({
				ok: true,
				message: 'HTTP 206 Partial Content, application/json'
			});
			expect(seen.slice(-2).map((request) => request.method)).toEqual(['HEAD', 'GET']);
			expect(seen.at(-1)?.headers.range).toBe('bytes=0-0');
		});

		it('lists one key of a bucket with a signed request', async () => {
			const created = await createDataSource({
				name: 'Media bucket',
				type: 's3',
				settings: { endpoint: base, bucket: 'media', accessKeyId: 'AKIATEST' },
				secrets: { secretAccessKey: 'secret-key' }
			});
			expect(await testDataSource(created.id)).toMatchObject({
				ok: true,
				message: 'Bucket media answered, has objects.'
			});
			expect(seen.at(-1)?.url).toBe('/media/?list-type=2&max-keys=1');

			const denied = await createDataSource({
				name: 'Wrong bucket',
				type: 's3',
				settings: { endpoint: base, bucket: 'other', accessKeyId: 'AKIATEST' },
				secrets: { secretAccessKey: 'secret-key' }
			});
			expect(await testDataSource(denied.id)).toMatchObject({
				ok: false,
				message: 'AccessDenied: Access Denied'
			});
		});
	});
});
