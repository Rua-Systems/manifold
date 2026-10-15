import { AwsClient } from 'aws4fetch';
import mysql from 'mysql2/promise';
import net from 'node:net';
import tls from 'node:tls';
import postgres from 'postgres';
import { connectionTarget, recordTest } from './datasources.server';
import { encodeCommand, infoField, parseReply, RespError, type RespReply } from './resp';
import { openTunnel, type Tunnel } from './tunnel.server';
import type {
	ApiSettings,
	DatabaseSettings,
	DataSourceSecrets,
	DataSourceType,
	LinkSettings,
	RedisSettings,
	S3Settings,
	SettingsByType,
	SshSettings,
	TestOutcome
} from './types';

// Connection tests: the server connects the way a client of the source would, reads something
// harmless (the server version, a PING, one key of a bucket listing, a status line) and closes.
// Nothing is written. The owner chose where a source points, so the test goes where it says; it
// follows no redirects and gives up after a few seconds.

const TIMEOUT_MS = 10_000;

/** Where to connect: the source itself, or the near end of its SSH tunnel. */
interface Endpoint {
	host: string;
	port: number;
	/** The source's own host name, for checking its TLS certificate through a tunnel. */
	serverName: string;
}

function timeoutError(): Error {
	return new Error(`No answer within ${TIMEOUT_MS / 1000} seconds.`);
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const limit = new Promise<never>((_resolve, reject) => {
		timer = setTimeout(() => reject(timeoutError()), ms);
	});
	return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

/** A short, readable reason from what a driver or the network threw. */
export function describeError(error: unknown): string {
	if (!(error instanceof Error)) {
		return String(error);
	}
	const code = (error as { code?: unknown }).code;
	if (code === 'ECONNREFUSED') {
		return 'The connection was refused.';
	}
	if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
		return 'The host name was not found.';
	}
	if (code === 'ETIMEDOUT' || error.name === 'TimeoutError') {
		return timeoutError().message;
	}
	if (code === 'ECONNRESET') {
		return 'The connection was closed by the other side.';
	}
	return error.message.replace(/\s+/g, ' ').trim() || error.name;
}

async function testPostgres(
	settings: DatabaseSettings,
	secrets: DataSourceSecrets,
	endpoint: Endpoint
): Promise<string> {
	let ssl: boolean | 'require' | tls.ConnectionOptions = false;
	if (settings.ssl === 'require') {
		ssl = 'require';
	} else if (settings.ssl === 'verify') {
		ssl = { rejectUnauthorized: true, servername: endpoint.serverName };
	}
	const sql = postgres({
		host: endpoint.host,
		port: endpoint.port,
		database: settings.database || undefined,
		username: settings.username,
		password: secrets.password ?? '',
		ssl,
		max: 1,
		connect_timeout: TIMEOUT_MS / 1000,
		idle_timeout: 1,
		prepare: false,
		onnotice: () => {},
		connection: { application_name: 'manifold-connection-test' }
	});
	try {
		const [row] = await sql<{ version: string }[]>`select version() as version`;
		return row.version;
	} finally {
		await sql.end({ timeout: 1 });
	}
}

async function testMysql(
	settings: DatabaseSettings,
	secrets: DataSourceSecrets,
	endpoint: Endpoint
): Promise<string> {
	let ssl: mysql.SslOptions | undefined;
	if (settings.ssl === 'require') {
		ssl = { rejectUnauthorized: false };
	} else if (settings.ssl === 'verify') {
		ssl = { rejectUnauthorized: true };
	}
	const connection = await mysql.createConnection({
		host: endpoint.host,
		port: endpoint.port,
		user: settings.username,
		password: secrets.password ?? '',
		database: settings.database || undefined,
		connectTimeout: TIMEOUT_MS,
		ssl
	});
	try {
		const [rows] = await connection.query<mysql.RowDataPacket[]>('SELECT VERSION() AS version');
		return `MySQL ${String(rows[0]?.version ?? '')}`.trim();
	} finally {
		await connection.end();
	}
}

/** Sends the commands at once and collects one reply for each. */
function redisExchange(socket: net.Socket, commands: string[][]): Promise<RespReply[]> {
	return new Promise((resolve, reject) => {
		let buffer = Buffer.alloc(0);
		const replies: RespReply[] = [];
		socket.on('data', (chunk: Buffer) => {
			buffer = Buffer.concat([buffer, chunk]);
			try {
				let parsed = parseReply(buffer);
				while (parsed !== null) {
					replies.push(parsed.reply);
					buffer = buffer.subarray(parsed.end);
					if (replies.length === commands.length) {
						resolve(replies);
						return;
					}
					parsed = null;
					if (buffer.length > 0) {
						parsed = parseReply(buffer);
					}
				}
			} catch (error) {
				reject(error);
			}
		});
		socket.on('error', reject);
		socket.on('close', () => reject(new Error('The server closed the connection.')));
		for (const command of commands) {
			socket.write(encodeCommand(command));
		}
	});
}

async function testRedis(
	settings: RedisSettings,
	secrets: DataSourceSecrets,
	endpoint: Endpoint
): Promise<string> {
	const socket = await new Promise<net.Socket>((resolve, reject) => {
		let connected: net.Socket;
		if (settings.tls) {
			connected = tls.connect(
				{
					host: endpoint.host,
					port: endpoint.port,
					servername: endpoint.serverName,
					rejectUnauthorized: true
				},
				() => resolve(connected)
			);
		} else {
			connected = net.connect({ host: endpoint.host, port: endpoint.port }, () =>
				resolve(connected)
			);
		}
		connected.once('error', reject);
	});
	try {
		const commands: string[][] = [];
		if (secrets.password !== undefined && secrets.password !== '') {
			const auth = ['AUTH'];
			if (settings.username !== '') {
				auth.push(settings.username);
			}
			commands.push([...auth, secrets.password]);
		}
		if (settings.database !== 0) {
			commands.push(['SELECT', String(settings.database)]);
		}
		commands.push(['PING'], ['INFO', 'server']);
		const replies = await redisExchange(socket, commands);
		const refused = replies.find((reply) => reply instanceof RespError);
		if (refused instanceof RespError) {
			throw new Error(refused.message);
		}
		const info = replies[replies.length - 1];
		let version: string | null = null;
		if (typeof info === 'string') {
			version = infoField(info, 'redis_version');
		}
		return `Redis ${version ?? ''}`.trim();
	} finally {
		socket.destroy();
	}
}

/** The address of a bucket listing: path style or virtual host, AWS or a compatible service. */
export function bucketUrl(settings: S3Settings): string {
	let base = settings.endpoint.replace(/\/+$/, '');
	if (base === '') {
		base = `https://s3.${settings.region}.amazonaws.com`;
	}
	const url = new URL(base);
	if (settings.pathStyle) {
		url.pathname = `${url.pathname.replace(/\/+$/, '')}/${settings.bucket}/`;
	} else {
		url.hostname = `${settings.bucket}.${url.hostname}`;
		url.pathname = '/';
	}
	url.search = 'list-type=2&max-keys=1';
	return url.toString();
}

/** The `<Code>` and `<Message>` of an S3 error answer. */
function s3Error(body: string, status: number): string {
	const code = /<Code>([^<]*)<\/Code>/.exec(body)?.[1];
	const message = /<Message>([^<]*)<\/Message>/.exec(body)?.[1];
	if (code !== undefined) {
		return [code, message].filter((part) => part !== undefined && part !== '').join(': ');
	}
	return `HTTP ${status}`;
}

async function testS3(settings: S3Settings, secrets: DataSourceSecrets): Promise<string> {
	const client = new AwsClient({
		accessKeyId: settings.accessKeyId,
		secretAccessKey: secrets.secretAccessKey ?? '',
		region: settings.region,
		service: 's3'
	});
	const response = await client.fetch(bucketUrl(settings), {
		method: 'GET',
		redirect: 'manual',
		signal: AbortSignal.timeout(TIMEOUT_MS)
	});
	const body = await response.text();
	if (!response.ok) {
		throw new Error(s3Error(body, response.status));
	}
	const keys = /<KeyCount>(\d+)<\/KeyCount>/.exec(body)?.[1] ?? '0';
	let content = 'empty';
	if (keys !== '0') {
		content = 'has objects';
	}
	return `Bucket ${settings.bucket} answered, ${content}.`;
}

function statusLine(response: Response): string {
	return `HTTP ${response.status} ${response.statusText}`.trim();
}

/** Joins a path such as `/health` onto a base address, keeping the base's own path. */
export function joinUrl(base: string, path: string): string {
	if (path === '') {
		return base;
	}
	let root = base;
	if (!root.endsWith('/')) {
		root = `${root}/`;
	}
	return new URL(path.replace(/^\/+/, ''), root).toString();
}

async function testApi(settings: ApiSettings, secrets: DataSourceSecrets): Promise<string> {
	const headers = new Headers({ accept: 'application/json, */*' });
	const token = secrets.token ?? '';
	if (settings.auth === 'bearer') {
		headers.set('authorization', `Bearer ${token}`);
	} else if (settings.auth === 'header') {
		headers.set(settings.headerName, token);
	} else if (settings.auth === 'basic') {
		const pair = Buffer.from(`${settings.username}:${secrets.password ?? ''}`).toString(
			'base64'
		);
		headers.set('authorization', `Basic ${pair}`);
	}
	const response = await fetch(joinUrl(settings.baseUrl, settings.testPath), {
		headers,
		redirect: 'manual',
		signal: AbortSignal.timeout(TIMEOUT_MS)
	});
	await response.body?.cancel();
	if (response.status >= 400) {
		throw new Error(statusLine(response));
	}
	return statusLine(response);
}

async function testLink(settings: LinkSettings, secrets: DataSourceSecrets): Promise<string> {
	const headers = new Headers();
	if (settings.auth === 'bearer') {
		headers.set('authorization', `Bearer ${secrets.token ?? ''}`);
	}
	const request = (method: string, extra: Record<string, string>) => {
		const sent = new Headers(headers);
		for (const [name, value] of Object.entries(extra)) {
			sent.set(name, value);
		}
		return fetch(settings.url, {
			method,
			headers: sent,
			redirect: 'manual',
			signal: AbortSignal.timeout(TIMEOUT_MS)
		});
	};
	let response = await request('HEAD', {});
	// Some servers refuse HEAD; the first byte of a GET tells as much.
	if (response.status === 405 || response.status === 501) {
		response = await request('GET', { range: 'bytes=0-0' });
	}
	await response.body?.cancel();
	if (response.status >= 400) {
		throw new Error(statusLine(response));
	}
	const parts = [statusLine(response)];
	const type = response.headers.get('content-type');
	if (type !== null) {
		parts.push(type);
	}
	return parts.join(', ');
}

function sshOf(type: DataSourceType, settings: unknown): SshSettings | null {
	if (type === 'postgresql' || type === 'mysql' || type === 'redis') {
		const ssh = (settings as { ssh: SshSettings }).ssh;
		if (ssh.enabled) {
			return ssh;
		}
	}
	return null;
}

/** Runs the test of one type; `opened` hears of a tunnel so it is closed whatever happens. */
async function runTest(
	type: DataSourceType,
	settings: SettingsByType[DataSourceType],
	secrets: DataSourceSecrets,
	opened: (tunnel: Tunnel) => void
): Promise<string> {
	if (type === 's3') {
		return testS3(settings as S3Settings, secrets);
	}
	if (type === 'api') {
		return testApi(settings as ApiSettings, secrets);
	}
	if (type === 'link') {
		return testLink(settings as LinkSettings, secrets);
	}
	const server = settings as DatabaseSettings | RedisSettings;
	let endpoint: Endpoint = { host: server.host, port: server.port, serverName: server.host };
	const ssh = sshOf(type, settings);
	if (ssh !== null) {
		const tunnel = await openTunnel(
			ssh,
			secrets,
			{ host: server.host, port: server.port },
			TIMEOUT_MS
		);
		opened(tunnel);
		endpoint = { host: tunnel.host, port: tunnel.port, serverName: server.host };
	}
	if (type === 'postgresql') {
		return testPostgres(settings as DatabaseSettings, secrets, endpoint);
	}
	if (type === 'mysql') {
		return testMysql(settings as DatabaseSettings, secrets, endpoint);
	}
	return testRedis(settings as RedisSettings, secrets, endpoint);
}

/** Tests a stored source, keeps the outcome with it and answers it. */
export async function testDataSource(id: string): Promise<TestOutcome> {
	const { view, secrets } = await connectionTarget(id);
	const started = performance.now();
	let tunnel: Tunnel | null = null;
	let outcome: TestOutcome;
	try {
		const found = await withTimeout(
			runTest(view.type, view.settings, secrets, (opened) => {
				tunnel = opened;
			}),
			TIMEOUT_MS * 2
		);
		outcome = { ok: true, message: found, durationMs: 0 };
	} catch (error) {
		outcome = { ok: false, message: describeError(error), durationMs: 0 };
	} finally {
		(tunnel as Tunnel | null)?.close();
	}
	outcome.durationMs = Math.round(performance.now() - started);
	// Only a tunnel that carried a working connection gets its host key trusted.
	let trusted: string | null = null;
	if (outcome.ok) {
		trusted = (tunnel as Tunnel | null)?.fingerprint ?? null;
	}
	await recordTest(view.id, outcome, trusted);
	return outcome;
}
