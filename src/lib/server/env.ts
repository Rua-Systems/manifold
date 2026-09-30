import { readFileSync } from 'node:fs';
import { z } from 'zod';

// Plain module on purpose: the CLI parses process.env with it, the app parses $env/dynamic/private.

const DEFAULT_ORGANIZATION_NAME = 'Manifold';
const DEFAULT_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const DEFAULT_TILE_ATTRIBUTION =
	'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const DEFAULT_MAP_CENTER: [number, number] = [0, 20];
const DEFAULT_MAP_ZOOM = 2;
const DEFAULT_UPLOAD_DIR = '/data/uploads';
const DEV_UPLOAD_DIR = './.data/uploads';
const DEFAULT_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_TRASH_RETENTION_DAYS = 30;
const DEFAULT_AUDIT_RETENTION_DAYS = 180;
const DEFAULT_API_RATE_LIMIT = 120;
const ENCRYPTION_KEY_BYTES = 32;
const SECRET_MIN_LENGTH = 32;

/** Compose passes unset variables as empty strings; treat them as missing. */
function blankAsMissing(value: unknown): unknown {
	if (typeof value === 'string' && value.trim().length === 0) {
		return undefined;
	}
	return value;
}

function optional<T extends z.ZodType>(schema: T) {
	return z.preprocess(blankAsMissing, schema.optional());
}

/** The fallback is written as the variable would be, then parsed like a set value. */
function withDefault<T extends z.ZodType>(schema: T, fallback: z.input<T>) {
	return z.preprocess(blankAsMissing, schema.prefault(fallback));
}

const positiveInteger = z.coerce.number().int().positive();

const mapCenter = z.string().transform((value, context): [number, number] => {
	const parts = value.split(',').map((part) => Number(part.trim()));
	const [lon, lat] = parts;
	if (
		parts.length !== 2 ||
		!Number.isFinite(lon) ||
		!Number.isFinite(lat) ||
		Math.abs(lon) > 180 ||
		Math.abs(lat) > 90
	) {
		context.addIssue({ code: 'custom', message: 'Expected "lon,lat" in degrees.' });
		return z.NEVER;
	}
	return [lon, lat];
});

const encryptionKey = z
	.string()
	.refine((value) => Buffer.from(value, 'base64').length === ENCRYPTION_KEY_BYTES, {
		message: `Expected ${ENCRYPTION_KEY_BYTES} random bytes, base64 encoded.`
	});

const origin = z
	.url({ protocol: /^https?$/, message: 'Expected an http or https URL.' })
	.refine((value) => !value.endsWith('/'), { message: 'Remove the trailing slash.' });

const databaseUrl = z.string().refine((value) => /^postgres(ql)?:\/\//.test(value), {
	message: 'Expected a postgres:// connection string.'
});

const booleanFlag = z.enum(['true', 'false']).transform((value) => value === 'true');

function buildSchema(dev: boolean) {
	let uploadDir = DEFAULT_UPLOAD_DIR;
	if (dev) {
		uploadDir = DEV_UPLOAD_DIR;
	}

	return z.object({
		ORIGIN: z.preprocess(blankAsMissing, origin),
		ORGANIZATION_NAME: withDefault(z.string().trim().max(80), DEFAULT_ORGANIZATION_NAME),
		DATABASE_URL: z.preprocess(blankAsMissing, databaseUrl),
		BETTER_AUTH_SECRET: z.preprocess(
			blankAsMissing,
			z.string().min(SECRET_MIN_LENGTH, {
				message: `Use at least ${SECRET_MIN_LENGTH} characters.`
			})
		),
		ENCRYPTION_KEY: z.preprocess(blankAsMissing, encryptionKey),
		OWNER_USERNAME: optional(z.string()),
		OWNER_EMAIL: optional(z.string()),
		OWNER_PASSWORD: optional(z.string()),
		SMTP_HOST: optional(z.string()),
		SMTP_PORT: withDefault(positiveInteger.max(65535), 587),
		SMTP_SECURE: withDefault(booleanFlag, 'false'),
		SMTP_USER: optional(z.string()),
		SMTP_PASSWORD: optional(z.string()),
		MAIL_FROM: optional(z.string()),
		MAP_TILE_URL: withDefault(z.string(), DEFAULT_TILE_URL),
		MAP_TILE_ATTRIBUTION: withDefault(z.string(), DEFAULT_TILE_ATTRIBUTION),
		MAP_DEFAULT_CENTER: withDefault(mapCenter, DEFAULT_MAP_CENTER.join(',')),
		MAP_DEFAULT_ZOOM: withDefault(z.coerce.number().min(0).max(22), DEFAULT_MAP_ZOOM),
		UPLOAD_DIR: withDefault(z.string(), uploadDir),
		UPLOAD_MAX_BYTES: withDefault(positiveInteger, DEFAULT_UPLOAD_MAX_BYTES),
		TRASH_RETENTION_DAYS: withDefault(positiveInteger, DEFAULT_TRASH_RETENTION_DAYS),
		AUDIT_RETENTION_DAYS: withDefault(positiveInteger, DEFAULT_AUDIT_RETENTION_DAYS),
		API_RATE_LIMIT_PER_MINUTE: withDefault(positiveInteger, DEFAULT_API_RATE_LIMIT)
	});
}

export type Env = z.output<ReturnType<typeof buildSchema>>;

export type EnvSource = Record<string, string | undefined>;

export interface LoadEnvOptions {
	dev: boolean;
}

export class EnvError extends Error {
	constructor(issues: string[]) {
		super(
			`Invalid environment configuration:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`
		);
		this.name = 'EnvError';
	}
}

/** Secrets that may also come from a file, such as a Docker secret: `DATABASE_URL_FILE` and so on. */
const FILE_VARIABLES = [
	'DATABASE_URL',
	'BETTER_AUTH_SECRET',
	'ENCRYPTION_KEY',
	'OWNER_PASSWORD',
	'SMTP_PASSWORD'
] as const;

/** The password `.env.example` ships with; a public instance must not keep it. */
const PLACEHOLDER_DATABASE_PASSWORD = 'change-me';

/** Replaces each `<NAME>_FILE` with the content of that file as `<NAME>`. */
function resolveFileVariables(source: EnvSource): { resolved: EnvSource; issues: string[] } {
	const resolved: EnvSource = { ...source };
	const issues: string[] = [];
	for (const name of FILE_VARIABLES) {
		const file = source[`${name}_FILE`]?.trim();
		if (file === undefined || file.length === 0) {
			continue;
		}
		if ((source[name] ?? '').trim().length > 0) {
			issues.push(`${name}: Set either ${name} or ${name}_FILE, not both.`);
			continue;
		}
		try {
			resolved[name] = readFileSync(file, 'utf8').replace(/\r?\n$/, '');
		} catch {
			issues.push(`${name}_FILE: The file cannot be read.`);
		}
	}
	return { resolved, issues };
}

function databasePassword(url: string): string {
	try {
		return decodeURIComponent(new URL(url).password);
	} catch {
		return '';
	}
}

/** Validates the environment. Messages name the variable and the rule, never the value. */
export function parseEnv(source: EnvSource, options: LoadEnvOptions): Env {
	const { resolved, issues } = resolveFileVariables(source);
	const result = buildSchema(options.dev).safeParse(resolved);
	if (!result.success) {
		issues.push(
			...result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
		);
	} else if (
		result.data.ORIGIN.startsWith('https://') &&
		databasePassword(result.data.DATABASE_URL) === PLACEHOLDER_DATABASE_PASSWORD
	) {
		issues.push('DATABASE_URL: Replace the example database password with a new one.');
	}
	if (issues.length > 0 || !result.success) {
		throw new EnvError(issues);
	}
	return result.data;
}

// Configuration shared by every request; it never holds per-user data.
let current: Env | undefined;

export function loadEnv(source: EnvSource, options: LoadEnvOptions): Env {
	current = parseEnv(source, options);
	return current;
}

export function getEnv(): Env {
	if (current === undefined) {
		throw new Error('The environment has not been loaded yet.');
	}
	return current;
}
