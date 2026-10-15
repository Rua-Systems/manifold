// The kinds of sources the module keeps, their settings without secrets, and the secrets apart.

export const DATA_SOURCE_TYPES = ['postgresql', 'mysql', 'redis', 's3', 'api', 'link'] as const;

export type DataSourceType = (typeof DATA_SOURCE_TYPES)[number];

/** How a database connection uses TLS: not at all, encrypted, or encrypted with a checked certificate. */
export type SslMode = 'disable' | 'require' | 'verify';

export type SshAuth = 'password' | 'key';

/** An SSH tunnel the connection goes through, as DBeaver offers it. */
export interface SshSettings {
	enabled: boolean;
	host: string;
	port: number;
	username: string;
	auth: SshAuth;
	/**
	 * The SHA-256 fingerprint of the SSH server's host key, kept by the first test that got through
	 * and checked by every later one; empty until then. A new host or port forgets it.
	 */
	fingerprint: string;
}

export interface DatabaseSettings {
	host: string;
	port: number;
	database: string;
	username: string;
	ssl: SslMode;
	ssh: SshSettings;
}

export interface RedisSettings {
	host: string;
	port: number;
	username: string;
	/** The database number, 0 to 15. */
	database: number;
	tls: boolean;
	ssh: SshSettings;
}

export interface S3Settings {
	/** Empty for AWS itself, else the address of a compatible service such as MinIO or R2. */
	endpoint: string;
	region: string;
	bucket: string;
	accessKeyId: string;
	/** `endpoint/bucket` instead of `bucket.endpoint`, which most compatible services need. */
	pathStyle: boolean;
}

export type ApiAuth = 'none' | 'bearer' | 'header' | 'basic';

export interface ApiSettings {
	baseUrl: string;
	auth: ApiAuth;
	/** The header that carries the token with `header` auth, such as `X-Api-Key`. */
	headerName: string;
	/** The user name of `basic` auth. */
	username: string;
	/** A path under the base address that the connection test reads, such as `/health`. */
	testPath: string;
}

export type LinkAuth = 'none' | 'bearer';

export interface LinkSettings {
	url: string;
	auth: LinkAuth;
}

export interface SettingsByType {
	postgresql: DatabaseSettings;
	mysql: DatabaseSettings;
	redis: RedisSettings;
	s3: S3Settings;
	api: ApiSettings;
	link: LinkSettings;
}

/** Every secret a source can hold; which ones apply depends on the type and its settings. */
export interface DataSourceSecrets {
	password?: string;
	token?: string;
	secretAccessKey?: string;
	sshPassword?: string;
	sshPrivateKey?: string;
	sshPassphrase?: string;
}

export type SecretName = keyof DataSourceSecrets;

export const SECRET_NAMES: readonly SecretName[] = [
	'password',
	'token',
	'secretAccessKey',
	'sshPassword',
	'sshPrivateKey',
	'sshPassphrase'
];

/** The last connection test of a source. */
export interface DataSourceTest {
	at: Date;
	ok: boolean;
	message: string;
}

/** A source as the pages, the API and MCP see it: everything but the secrets' values. */
export interface DataSourceView<T extends DataSourceType = DataSourceType> {
	id: string;
	name: string;
	type: T;
	settings: SettingsByType[T];
	description: string;
	docsUrl: string | null;
	/** Which secrets hold a value, never the values. */
	secrets: SecretName[];
	lastTest: DataSourceTest | null;
	createdAt: Date;
	updatedAt: Date;
}

/** What a reveal answers: the secrets, and a connection URL where the type has one. */
export interface RevealedSecrets {
	secrets: DataSourceSecrets;
	connectionUrl: string | null;
}

/** The answer of a connection test. */
export interface TestOutcome {
	ok: boolean;
	/** What was found, such as the server version, or why it failed. */
	message: string;
	durationMs: number;
}
