import { m } from '$lib/paraglide/messages.js';
import type {
	ApiSettings,
	DatabaseSettings,
	DataSourceType,
	DataSourceView,
	LinkSettings,
	RedisSettings,
	S3Settings,
	SecretName
} from './types';

export const TYPE_LABELS: Record<DataSourceType, () => string> = {
	postgresql: m.datasources_type_postgresql,
	mysql: m.datasources_type_mysql,
	redis: m.datasources_type_redis,
	s3: m.datasources_type_s3,
	api: m.datasources_type_api,
	link: m.datasources_type_link
};

/** What each type is for, in a few words, on the page that adds a source. */
export const TYPE_HINTS: Record<DataSourceType, () => string> = {
	postgresql: m.datasources_type_postgresql_hint,
	mysql: m.datasources_type_mysql_hint,
	redis: m.datasources_type_redis_hint,
	s3: m.datasources_type_s3_hint,
	api: m.datasources_type_api_hint,
	link: m.datasources_type_link_hint
};

export const SECRET_LABELS: Record<SecretName, () => string> = {
	password: m.datasources_secret_password,
	token: m.datasources_secret_token,
	secretAccessKey: m.datasources_secret_secret_access_key,
	sshPassword: m.datasources_secret_ssh_password,
	sshPrivateKey: m.datasources_secret_ssh_private_key,
	sshPassphrase: m.datasources_secret_ssh_passphrase
};

/** Where a source points, in one line: `host:port/database`, the bucket, or the address. */
export function summaryOf(source: DataSourceView): string {
	if (source.type === 'postgresql' || source.type === 'mysql') {
		const settings = source.settings as DatabaseSettings;
		let line = `${settings.host}:${settings.port}`;
		if (settings.database !== '') {
			line = `${line}/${settings.database}`;
		}
		if (settings.ssh.enabled) {
			line = `${line} ${m.datasources_via_ssh({ host: settings.ssh.host })}`;
		}
		return line;
	}
	if (source.type === 'redis') {
		const settings = source.settings as RedisSettings;
		let line = `${settings.host}:${settings.port}/${settings.database}`;
		if (settings.ssh.enabled) {
			line = `${line} ${m.datasources_via_ssh({ host: settings.ssh.host })}`;
		}
		return line;
	}
	if (source.type === 's3') {
		const settings = source.settings as S3Settings;
		let where = settings.region;
		if (settings.endpoint !== '') {
			where = settings.endpoint;
		}
		return `${settings.bucket} · ${where}`;
	}
	if (source.type === 'api') {
		return (source.settings as ApiSettings).baseUrl;
	}
	return (source.settings as LinkSettings).url;
}
