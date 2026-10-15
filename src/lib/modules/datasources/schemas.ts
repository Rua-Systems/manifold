import { m } from '$lib/paraglide/messages.js';
import { URL_MAX_LENGTH } from '$lib/schemas/rules';
import { z } from 'zod';
import { DATA_SOURCE_TYPES, SECRET_NAMES, type DataSourceType, type SecretName } from './types';

// What a source may hold, checked the same way for the page, the API and MCP. The settings are
// checked by type; the secrets are optional everywhere, since which ones a source needs depends on
// how it authenticates.

export const DATA_SOURCE_NAME_MAX_LENGTH = 100;
export const DATA_SOURCE_DESCRIPTION_MAX_LENGTH = 5000;
const FIELD_MAX_LENGTH = 255;
const SECRET_MAX_LENGTH = 1000;
/** A private key in OpenSSH or PEM form, with room for long RSA keys. */
const PRIVATE_KEY_MAX_LENGTH = 20_000;

const required = () => m.validation_required();
const maxLength = (max: number) => () => m.validation_max_length({ max });

/** Control characters have no place in names and settings, and line breaks none in one line. */
const NO_CONTROL = /^[^\p{Cc}]*$/u;

export const dataSourceNameSchema = z
	.string()
	.trim()
	.min(1, { error: required })
	.max(DATA_SOURCE_NAME_MAX_LENGTH, { error: maxLength(DATA_SOURCE_NAME_MAX_LENGTH) })
	.regex(NO_CONTROL, { error: () => m.datasources_error_characters() });

const descriptionSchema = z
	.string()
	.trim()
	.max(DATA_SOURCE_DESCRIPTION_MAX_LENGTH, {
		error: maxLength(DATA_SOURCE_DESCRIPTION_MAX_LENGTH)
	})
	.default('');

/** Only http and https: anything else could run or leak when the address is opened. */
function webUrl() {
	return z
		.string()
		.trim()
		.min(1, { error: required })
		.max(URL_MAX_LENGTH, { error: maxLength(URL_MAX_LENGTH) })
		.pipe(z.url({ protocol: /^https?$/, error: () => m.datasources_error_url() }));
}

/** An optional address: empty means none. */
const optionalWebUrl = z
	.string()
	.trim()
	.max(URL_MAX_LENGTH, { error: maxLength(URL_MAX_LENGTH) })
	.refine((value) => value === '' || webUrl().safeParse(value).success, {
		error: () => m.datasources_error_url()
	})
	.default('');

/** A host name or an IP address, without a scheme, a path or credentials. */
const hostSchema = z
	.string()
	.trim()
	.min(1, { error: required })
	.max(FIELD_MAX_LENGTH, { error: maxLength(FIELD_MAX_LENGTH) })
	.regex(/^[^\s/\\@?#]+$/, { error: () => m.datasources_error_host() });

function portSchema(fallback: number) {
	return z.coerce
		.number({ error: () => m.datasources_error_port() })
		.int({ error: () => m.datasources_error_port() })
		.min(1, { error: () => m.datasources_error_port() })
		.max(65_535, { error: () => m.datasources_error_port() })
		.default(fallback);
}

/** A single line, such as a user or database name; may be empty unless `min` asks otherwise. */
function lineSchema(min = 0) {
	return z
		.string()
		.trim()
		.min(min, { error: required })
		.max(FIELD_MAX_LENGTH, { error: maxLength(FIELD_MAX_LENGTH) })
		.regex(NO_CONTROL, { error: () => m.datasources_error_characters() })
		.default('');
}

const sshSchema = z
	.object({
		enabled: z.boolean().default(false),
		host: z.string().trim().max(FIELD_MAX_LENGTH).default(''),
		port: portSchema(22),
		username: lineSchema(),
		auth: z.enum(['password', 'key']).default('password'),
		// Kept by the service from the tests, whatever the input says.
		fingerprint: z.string().max(100).default('')
	})
	.superRefine((ssh, context) => {
		if (!ssh.enabled) {
			return;
		}
		const host = hostSchema.safeParse(ssh.host);
		if (!host.success) {
			context.addIssue({
				code: 'custom',
				path: ['host'],
				message: host.error.issues[0]?.message ?? m.datasources_error_host()
			});
		}
		if (ssh.username === '') {
			context.addIssue({ code: 'custom', path: ['username'], message: required() });
		}
	})
	.default({
		enabled: false,
		host: '',
		port: 22,
		username: '',
		auth: 'password',
		fingerprint: ''
	});

function databaseSchema(defaultPort: number) {
	return z.object({
		host: hostSchema,
		port: portSchema(defaultPort),
		database: lineSchema(),
		username: lineSchema(1),
		ssl: z.enum(['disable', 'require', 'verify']).default('disable'),
		ssh: sshSchema
	});
}

const redisSchema = z.object({
	host: hostSchema,
	port: portSchema(6379),
	username: lineSchema(),
	database: z.coerce
		.number({ error: () => m.datasources_error_redis_database() })
		.int({ error: () => m.datasources_error_redis_database() })
		.min(0, { error: () => m.datasources_error_redis_database() })
		.max(15, { error: () => m.datasources_error_redis_database() })
		.default(0),
	tls: z.boolean().default(false),
	ssh: sshSchema
});

// S3 bucket names: 3 to 63 lowercase letters, digits, dots and hyphens, starting and ending with a
// letter or digit.
const BUCKET = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

const s3Schema = z.object({
	endpoint: optionalWebUrl,
	region: z
		.string()
		.trim()
		.max(64, { error: maxLength(64) })
		.regex(/^[a-z0-9-]*$/, { error: () => m.datasources_error_region() })
		.transform((value) => value || 'us-east-1')
		.default('us-east-1'),
	bucket: z
		.string()
		.trim()
		.min(1, { error: required })
		.regex(BUCKET, { error: () => m.datasources_error_bucket() }),
	accessKeyId: lineSchema(1),
	pathStyle: z.boolean().default(true)
});

// A header name is an HTTP token.
const HEADER_NAME = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;

const apiSchema = z
	.object({
		baseUrl: webUrl(),
		auth: z.enum(['none', 'bearer', 'header', 'basic']).default('none'),
		headerName: z
			.string()
			.trim()
			.max(100, { error: maxLength(100) })
			.default(''),
		username: lineSchema(),
		testPath: z
			.string()
			.trim()
			.max(500, { error: maxLength(500) })
			.regex(/^(\/[^\s]*)?$/, { error: () => m.datasources_error_path() })
			.default('')
	})
	.superRefine((api, context) => {
		if (api.auth === 'header' && !HEADER_NAME.test(api.headerName)) {
			context.addIssue({
				code: 'custom',
				path: ['headerName'],
				message: m.datasources_error_header()
			});
		}
		if (api.auth === 'basic' && api.username === '') {
			context.addIssue({ code: 'custom', path: ['username'], message: required() });
		}
	});

const linkSchema = z.object({
	url: webUrl(),
	auth: z.enum(['none', 'bearer']).default('none')
});

/** The settings of each type. */
export const SETTINGS_SCHEMAS = {
	postgresql: databaseSchema(5432),
	mysql: databaseSchema(3306),
	redis: redisSchema,
	s3: s3Schema,
	api: apiSchema,
	link: linkSchema
} satisfies Record<DataSourceType, z.ZodType>;

/** A secret to set, null to remove it, or left out to keep what is stored. */
function secretSchema(max: number) {
	return z
		.string()
		.max(max, { error: maxLength(max) })
		.nullable()
		.optional();
}

export const secretsInputSchema = z
	.object({
		password: secretSchema(SECRET_MAX_LENGTH),
		token: secretSchema(SECRET_MAX_LENGTH * 4),
		secretAccessKey: secretSchema(SECRET_MAX_LENGTH),
		sshPassword: secretSchema(SECRET_MAX_LENGTH),
		sshPrivateKey: secretSchema(PRIVATE_KEY_MAX_LENGTH),
		sshPassphrase: secretSchema(SECRET_MAX_LENGTH)
	})
	.default({});

export type SecretsInput = z.output<typeof secretsInputSchema>;

export const dataSourceTypeSchema = z.enum(DATA_SOURCE_TYPES, {
	error: () => m.datasources_error_type()
});

/** The fields every source has, whatever its type. */
export const commonInputSchema = z.object({
	name: dataSourceNameSchema,
	description: descriptionSchema,
	docsUrl: optionalWebUrl
});

/** Whether a name is one of the secrets, for reading form fields and API bodies. */
export function isSecretName(value: string): value is SecretName {
	return (SECRET_NAMES as readonly string[]).includes(value);
}
