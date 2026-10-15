import { describe, expect, it } from 'vitest';
import { connectionUrl } from './connection-url';
import { encodeCommand, infoField, parseReply, RespError } from './resp';
import { secretsInputSchema, SETTINGS_SCHEMAS } from './schemas';
import type { DatabaseSettings, RedisSettings } from './types';

const SSH_OFF = {
	enabled: false,
	host: '',
	port: 22,
	username: '',
	auth: 'password' as const,
	fingerprint: ''
};

function issues(result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) {
	return (result.error?.issues ?? []).map((issue) => issue.path.map(String).join('.'));
}

describe('settings', () => {
	it('fills the defaults of a database', () => {
		const parsed = SETTINGS_SCHEMAS.postgresql.parse({ host: 'db.local', username: 'app' });
		expect(parsed).toEqual({
			host: 'db.local',
			port: 5432,
			database: '',
			username: 'app',
			ssl: 'disable',
			ssh: SSH_OFF
		});
		expect(SETTINGS_SCHEMAS.mysql.parse({ host: 'db', username: 'root' }).port).toBe(3306);
		expect(SETTINGS_SCHEMAS.redis.parse({ host: 'cache' })).toMatchObject({
			port: 6379,
			database: 0,
			tls: false
		});
	});

	it('takes ports as numbers or digits and refuses others', () => {
		expect(
			SETTINGS_SCHEMAS.postgresql.parse({ host: 'h', username: 'u', port: '6543' }).port
		).toBe(6543);
		for (const port of ['0', '65536', 'abc', '1.5']) {
			const result = SETTINGS_SCHEMAS.postgresql.safeParse({
				host: 'h',
				username: 'u',
				port
			});
			expect(issues(result), port).toContain('port');
		}
	});

	it('refuses hosts with a scheme, a path or spaces', () => {
		for (const host of ['http://db', 'db/path', 'db host', 'user@db', '']) {
			const result = SETTINGS_SCHEMAS.redis.safeParse({ host });
			expect(issues(result), host).toContain('host');
		}
		for (const host of ['db.example.com', '10.0.0.5', '::1', 'fe80::1%eth0']) {
			expect(SETTINGS_SCHEMAS.redis.safeParse({ host }).success, host).toBe(true);
		}
	});

	it('asks for the SSH host and user only when the tunnel is on', () => {
		const off = SETTINGS_SCHEMAS.mysql.safeParse({
			host: 'db',
			username: 'u',
			ssh: { enabled: false, host: '', username: '' }
		});
		expect(off.success).toBe(true);
		const on = SETTINGS_SCHEMAS.mysql.safeParse({
			host: 'db',
			username: 'u',
			ssh: { enabled: true, host: '', username: '' }
		});
		expect(issues(on).sort()).toEqual(['ssh.host', 'ssh.username']);
	});

	it('checks buckets, regions and endpoints of S3', () => {
		const good = SETTINGS_SCHEMAS.s3.parse({ bucket: 'my-bucket.2026', accessKeyId: 'AKIA' });
		expect(good).toEqual({
			endpoint: '',
			region: 'us-east-1',
			bucket: 'my-bucket.2026',
			accessKeyId: 'AKIA',
			pathStyle: true
		});
		const bad = SETTINGS_SCHEMAS.s3.safeParse({
			bucket: 'No_Caps',
			accessKeyId: 'AKIA',
			region: 'EU Central',
			endpoint: 'ftp://minio'
		});
		expect(issues(bad).sort()).toEqual(['bucket', 'endpoint', 'region']);
	});

	it('needs a header name for header auth and a user for basic auth', () => {
		const header = SETTINGS_SCHEMAS.api.safeParse({
			baseUrl: 'https://api.example.com',
			auth: 'header',
			headerName: 'Bad Header'
		});
		expect(issues(header)).toEqual(['headerName']);
		const basic = SETTINGS_SCHEMAS.api.safeParse({
			baseUrl: 'https://api.example.com',
			auth: 'basic'
		});
		expect(issues(basic)).toEqual(['username']);
		expect(
			issues(
				SETTINGS_SCHEMAS.api.safeParse({
					baseUrl: 'https://api.example.com',
					testPath: 'health'
				})
			)
		).toEqual(['testPath']);
	});

	it('takes only http and https addresses', () => {
		for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'not a url']) {
			expect(SETTINGS_SCHEMAS.link.safeParse({ url }).success, url).toBe(false);
		}
		expect(SETTINGS_SCHEMAS.link.parse({ url: 'https://cdn.example.com/a.json' }).auth).toBe(
			'none'
		);
	});
});

describe('secrets', () => {
	it('keeps values, nulls and left out ones apart', () => {
		expect(secretsInputSchema.parse({ password: 'x', token: null })).toEqual({
			password: 'x',
			token: null
		});
		expect(secretsInputSchema.parse(undefined)).toEqual({});
		expect(secretsInputSchema.safeParse({ password: 'x'.repeat(1001) }).success).toBe(false);
		expect(secretsInputSchema.safeParse({ sshPrivateKey: 'k'.repeat(15_000) }).success).toBe(
			true
		);
	});
});

describe('connectionUrl', () => {
	const database: DatabaseSettings = {
		host: 'db.example.com',
		port: 5432,
		database: 'shop',
		username: 'app user',
		ssl: 'verify',
		ssh: SSH_OFF
	};

	it('builds PostgreSQL and MySQL URLs with encoded credentials', () => {
		expect(connectionUrl('postgresql', database, { password: 'p@ss:/?' })).toBe(
			'postgresql://app%20user:p%40ss%3A%2F%3F@db.example.com:5432/shop?sslmode=verify-full'
		);
		expect(
			connectionUrl('mysql', { ...database, port: 3306, ssl: 'disable' }, { password: 'x' })
		).toBe('mysql://app%20user:x@db.example.com:3306/shop?ssl-mode=DISABLED');
		expect(connectionUrl('postgresql', { ...database, host: '::1', ssl: 'require' }, {})).toBe(
			'postgresql://app%20user@[::1]:5432/shop?sslmode=require'
		);
	});

	it('builds Redis URLs with or without TLS and a user', () => {
		const redis: RedisSettings = {
			host: 'cache',
			port: 6380,
			username: '',
			database: 2,
			tls: true,
			ssh: SSH_OFF
		};
		expect(connectionUrl('redis', redis, { password: 'secret' })).toBe(
			'rediss://:secret@cache:6380/2'
		);
		expect(connectionUrl('redis', { ...redis, tls: false }, {})).toBe('redis://cache:6380/2');
		expect(connectionUrl('redis', { ...redis, username: 'worker' }, { password: 'pw' })).toBe(
			'rediss://worker:pw@cache:6380/2'
		);
	});

	it('answers the address for APIs and links, and nothing for S3', () => {
		expect(
			connectionUrl(
				'api',
				{
					baseUrl: 'https://api.example.com/v1',
					auth: 'bearer',
					headerName: '',
					username: '',
					testPath: ''
				},
				{ token: 't' }
			)
		).toBe('https://api.example.com/v1');
		expect(
			connectionUrl(
				's3',
				{
					endpoint: '',
					region: 'eu-west-1',
					bucket: 'b',
					accessKeyId: 'a',
					pathStyle: true
				},
				{ secretAccessKey: 's' }
			)
		).toBeNull();
	});
});

describe('RESP', () => {
	it('encodes commands as arrays of bulk strings', () => {
		expect(encodeCommand(['AUTH', 'pässword']).toString('utf8')).toBe(
			'*2\r\n$4\r\nAUTH\r\n$9\r\npässword\r\n'
		);
	});

	it('parses every kind of reply, and waits for incomplete ones', () => {
		expect(parseReply(Buffer.from('+PONG\r\n'))).toEqual({ reply: 'PONG', end: 7 });
		const error = parseReply(Buffer.from('-WRONGPASS invalid password\r\n'));
		expect(error?.reply).toBeInstanceOf(RespError);
		expect((error?.reply as RespError).message).toBe('WRONGPASS invalid password');
		expect(parseReply(Buffer.from(':42\r\n'))?.reply).toBe(42);
		expect(parseReply(Buffer.from('$5\r\nhello\r\n'))?.reply).toBe('hello');
		expect(parseReply(Buffer.from('$-1\r\n'))?.reply).toBeNull();
		expect(parseReply(Buffer.from('*2\r\n+OK\r\n:1\r\n'))?.reply).toEqual(['OK', 1]);
		expect(parseReply(Buffer.from('$10\r\nhel'))).toBeNull();
		expect(parseReply(Buffer.from('*2\r\n+OK\r\n'))).toBeNull();
		expect(parseReply(Buffer.from('+PO'))).toBeNull();
		expect(() => parseReply(Buffer.from('?odd\r\n'))).toThrow();
	});

	it('reads a field of INFO', () => {
		const info = '# Server\r\nredis_version:7.2.4\r\nredis_mode:standalone\r\n';
		expect(infoField(info, 'redis_version')).toBe('7.2.4');
		expect(infoField(info, 'missing')).toBeNull();
	});
});
