import type {
	DatabaseSettings,
	DataSourceSecrets,
	DataSourceType,
	RedisSettings,
	SettingsByType,
	SslMode
} from './types';

// The connection URL of a source, the form database tools and drivers take. It holds the password,
// so it is only built for a reveal. Through an SSH tunnel the host is the one the SSH server sees.

const POSTGRES_SSL: Record<SslMode, string> = {
	disable: 'disable',
	require: 'require',
	verify: 'verify-full'
};

const MYSQL_SSL: Record<SslMode, string> = {
	disable: 'DISABLED',
	require: 'REQUIRED',
	verify: 'VERIFY_IDENTITY'
};

/** `user:password@`, `user@` or nothing, each part encoded for a URL. */
function credentials(username: string, password: string | undefined): string {
	const user = encodeURIComponent(username);
	if (password !== undefined && password !== '') {
		return `${user}:${encodeURIComponent(password)}@`;
	}
	if (user !== '') {
		return `${user}@`;
	}
	return '';
}

/** An IPv6 address goes in brackets in a URL. */
function hostPart(host: string): string {
	if (host.includes(':') && !host.startsWith('[')) {
		return `[${host}]`;
	}
	return host;
}

function databaseUrl(
	scheme: string,
	settings: DatabaseSettings,
	secrets: DataSourceSecrets,
	sslParameter: string
): string {
	const path = encodeURIComponent(settings.database);
	return `${scheme}://${credentials(settings.username, secrets.password)}${hostPart(settings.host)}:${settings.port}/${path}?${sslParameter}`;
}

function redisUrl(settings: RedisSettings, secrets: DataSourceSecrets): string {
	let scheme = 'redis';
	if (settings.tls) {
		scheme = 'rediss';
	}
	return `${scheme}://${credentials(settings.username, secrets.password)}${hostPart(settings.host)}:${settings.port}/${settings.database}`;
}

/** The URL for a type that has one; S3 has none, since its clients take keys and a bucket. */
export function connectionUrl<T extends DataSourceType>(
	type: T,
	settings: SettingsByType[T],
	secrets: DataSourceSecrets
): string | null {
	if (type === 'postgresql') {
		const database = settings as DatabaseSettings;
		return databaseUrl(
			'postgresql',
			database,
			secrets,
			`sslmode=${POSTGRES_SSL[database.ssl]}`
		);
	}
	if (type === 'mysql') {
		const database = settings as DatabaseSettings;
		return databaseUrl('mysql', database, secrets, `ssl-mode=${MYSQL_SSL[database.ssl]}`);
	}
	if (type === 'redis') {
		return redisUrl(settings as RedisSettings, secrets);
	}
	if (type === 'api') {
		return (settings as SettingsByType['api']).baseUrl;
	}
	if (type === 'link') {
		return (settings as SettingsByType['link']).url;
	}
	return null;
}
