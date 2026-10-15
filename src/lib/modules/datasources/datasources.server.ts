import { m } from '$lib/paraglide/messages.js';
import { getDb, type Database, type Transaction } from '$lib/server/db';
import { hasErrorCode, UNIQUE_VIOLATION } from '$lib/server/db/errors';
import { getEnv } from '$lib/server/env';
import { NotFoundError, ValidationError } from '$lib/server/errors';
import { parseEncryptionKey, seal, unseal } from '$lib/server/sealing';
import { containsPattern } from '$lib/server/search-query';
import type { FieldErrors } from '$lib/types/validation';
import { isUuid } from '$lib/utils/uuid';
import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import { connectionUrl } from './connection-url';
import { dataSource } from './schema.server';
import {
	commonInputSchema,
	dataSourceTypeSchema,
	secretsInputSchema,
	SETTINGS_SCHEMAS,
	type SecretsInput
} from './schemas';
import {
	SECRET_NAMES,
	type DataSourceSecrets,
	type DataSourceTest,
	type DataSourceType,
	type DataSourceView,
	type RevealedSecrets,
	type SecretName,
	type SettingsByType,
	type SshSettings,
	type TestOutcome
} from './types';

export const DATASOURCES_MODULE = 'datasources';

// Secrets only leave this module through `revealDataSource`, which the page calls after a step-up
// and the API and MCP behind the datasources:secrets scope, and through `connectionTarget`, which
// hands them to a connection test on the server. Everything else sees which secrets are set.

/** The secrets each type can use; others sent along are dropped. */
const SECRETS_OF: Record<DataSourceType, readonly SecretName[]> = {
	postgresql: ['password', 'sshPassword', 'sshPrivateKey', 'sshPassphrase'],
	mysql: ['password', 'sshPassword', 'sshPrivateKey', 'sshPassphrase'],
	redis: ['password', 'sshPassword', 'sshPrivateKey', 'sshPassphrase'],
	s3: ['secretAccessKey'],
	api: ['token', 'password'],
	link: ['token']
};

export interface DataSourceInput {
	name: unknown;
	type: unknown;
	description?: unknown;
	docsUrl?: unknown;
	settings: unknown;
	secrets?: unknown;
}

/** A change: the type stays, the settings are replaced, and the secrets merge. */
export type DataSourceUpdate = Omit<DataSourceInput, 'type'>;

function encryptionKey(): Buffer {
	return parseEncryptionKey(getEnv().ENCRYPTION_KEY);
}

/** Field errors keyed by the dotted path, such as `ssh.host`, under an optional prefix. */
function pathErrors(error: z.ZodError, prefix = ''): FieldErrors {
	const errors: FieldErrors = {};
	for (const issue of error.issues) {
		const key = prefix + issue.path.map(String).join('.');
		if (key.length > 0 && errors[key] === undefined) {
			errors[key] = issue.message;
		}
	}
	return errors;
}

function parseType(value: unknown): DataSourceType {
	const parsed = dataSourceTypeSchema.safeParse(value);
	if (!parsed.success) {
		throw new ValidationError({ type: m.datasources_error_type() });
	}
	return parsed.data;
}

/** Checks the common fields, the settings of the type and the secrets, reporting every error. */
function parseInput(type: DataSourceType, input: DataSourceUpdate) {
	const common = commonInputSchema.safeParse({
		name: input.name,
		description: input.description ?? '',
		docsUrl: input.docsUrl ?? ''
	});
	const settings = SETTINGS_SCHEMAS[type].safeParse(input.settings ?? {});
	const secrets = secretsInputSchema.safeParse(input.secrets ?? {});
	if (!common.success || !settings.success || !secrets.success) {
		const errors: FieldErrors = {};
		for (const result of [common, settings, secrets]) {
			if (!result.success) {
				Object.assign(errors, pathErrors(result.error));
			}
		}
		throw new ValidationError(errors);
	}
	return {
		name: common.data.name,
		description: common.data.description,
		docsUrl: common.data.docsUrl || null,
		settings: settings.data as SettingsByType[typeof type],
		secrets: secrets.data
	};
}

/** The stored secrets with the changes applied: a value sets, null removes, absent keeps. */
function mergeSecrets(
	type: DataSourceType,
	current: DataSourceSecrets,
	changes: SecretsInput
): DataSourceSecrets {
	const merged: DataSourceSecrets = {};
	for (const name of SECRETS_OF[type]) {
		const change = changes[name];
		if (change === null) {
			continue;
		}
		if (change !== undefined && change !== '') {
			merged[name] = change;
			continue;
		}
		if (current[name] !== undefined) {
			merged[name] = current[name];
		}
	}
	return merged;
}

function secretNames(secrets: DataSourceSecrets): SecretName[] {
	return SECRET_NAMES.filter((name) => secrets[name] !== undefined && secrets[name] !== '');
}

type Row = typeof dataSource.$inferSelect;

function openSecrets(row: Row): DataSourceSecrets {
	return JSON.parse(unseal(row, row.id, encryptionKey())) as DataSourceSecrets;
}

function toView(row: Row): DataSourceView {
	let lastTest: DataSourceTest | null = null;
	if (row.testedAt !== null) {
		lastTest = {
			at: row.testedAt,
			ok: row.testOk === true,
			message: row.testMessage ?? ''
		};
	}
	return {
		id: row.id,
		name: row.name,
		type: row.type,
		settings: row.settings as unknown as SettingsByType[DataSourceType],
		description: row.description,
		docsUrl: row.docsUrl,
		secrets: secretNames(openSecrets(row)),
		lastTest,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt
	};
}

function nameTakenOr(error: unknown): unknown {
	if (hasErrorCode(error, UNIQUE_VIOLATION)) {
		return new ValidationError({ name: m.datasources_error_name_taken() });
	}
	return error;
}

/** The SSH settings of a type that can tunnel, or null. */
function sshOf(type: DataSourceType, settings: unknown): SshSettings | null {
	const tunnels = type === 'postgresql' || type === 'mysql' || type === 'redis';
	if (!tunnels || typeof settings !== 'object' || settings === null) {
		return null;
	}
	return (settings as { ssh?: SshSettings }).ssh ?? null;
}

/**
 * The host key fingerprint survives a change only while the tunnel still goes to the same host
 * and port; input never sets it, since only a test that got through may.
 */
function keepFingerprint(
	type: DataSourceType,
	previous: unknown,
	next: SettingsByType[DataSourceType]
): void {
	const after = sshOf(type, next);
	if (after === null) {
		return;
	}
	const before = sshOf(type, previous);
	if (before !== null && before.host === after.host && before.port === after.port) {
		after.fingerprint = before.fingerprint ?? '';
	} else {
		after.fingerprint = '';
	}
}

/** The version new secrets are sealed under: the one the last rotation reached. */
async function currentKeyVersion(db: Database | Transaction = getDb()): Promise<number> {
	const [row] = await db
		.select({ version: sql<number>`coalesce(max(${dataSource.keyVersion}), 1)::int` })
		.from(dataSource);
	return row.version;
}

export interface DataSourceFilter {
	type?: DataSourceType;
	/** Matches the name, the description and the address of a source. */
	query?: string;
}

/** Every source by name, narrowed by type and words. */
export async function listDataSources(filter: DataSourceFilter = {}): Promise<DataSourceView[]> {
	const conditions: SQL[] = [];
	if (filter.type !== undefined) {
		conditions.push(eq(dataSource.type, filter.type));
	}
	const query = filter.query?.trim() ?? '';
	if (query.length > 0) {
		const pattern = containsPattern(query);
		const match = or(
			ilike(dataSource.name, pattern),
			ilike(dataSource.description, pattern),
			sql`${dataSource.settings}::text ilike ${pattern}`
		);
		if (match !== undefined) {
			conditions.push(match);
		}
	}
	const rows = await getDb()
		.select()
		.from(dataSource)
		.where(and(...conditions))
		.orderBy(asc(sql`lower(${dataSource.name})`), asc(dataSource.id));
	return rows.map(toView);
}

async function findRow(id: string): Promise<Row> {
	if (!isUuid(id)) {
		throw new NotFoundError('Data source');
	}
	const [row] = await getDb().select().from(dataSource).where(eq(dataSource.id, id)).limit(1);
	if (row === undefined) {
		throw new NotFoundError('Data source');
	}
	return row;
}

export async function getDataSource(id: string): Promise<DataSourceView> {
	return toView(await findRow(id));
}

export async function createDataSource(input: DataSourceInput): Promise<DataSourceView> {
	const type = parseType(input.type);
	const parsed = parseInput(type, input);
	keepFingerprint(type, null, parsed.settings);
	const secrets = mergeSecrets(type, {}, parsed.secrets);
	// The id is chosen first: it is sealed into the ciphertext, so the row needs it before insert.
	const id = randomUUID();
	const now = new Date();
	try {
		const [row] = await getDb()
			.insert(dataSource)
			.values({
				id,
				name: parsed.name,
				type,
				settings: parsed.settings as unknown as Record<string, unknown>,
				description: parsed.description,
				docsUrl: parsed.docsUrl,
				...seal(JSON.stringify(secrets), id, encryptionKey()),
				keyVersion: await currentKeyVersion(),
				createdAt: now,
				updatedAt: now
			})
			.returning();
		return toView(row);
	} catch (error) {
		throw nameTakenOr(error);
	}
}

/** Whether a change sets or removes a secret, which the page asks a step-up for. */
export function changesSecrets(secrets: unknown): boolean {
	const parsed = secretsInputSchema.safeParse(secrets ?? {});
	if (!parsed.success) {
		return true;
	}
	return Object.values(parsed.data).some((value) => value !== undefined && value !== '');
}

export async function updateDataSource(
	id: string,
	input: DataSourceUpdate
): Promise<DataSourceView> {
	const current = await findRow(id);
	const parsed = parseInput(current.type, input);
	keepFingerprint(current.type, current.settings, parsed.settings);
	const secrets = mergeSecrets(current.type, openSecrets(current), parsed.secrets);
	try {
		const [row] = await getDb()
			.update(dataSource)
			.set({
				name: parsed.name,
				settings: parsed.settings as unknown as Record<string, unknown>,
				description: parsed.description,
				docsUrl: parsed.docsUrl,
				...seal(JSON.stringify(secrets), current.id, encryptionKey()),
				updatedAt: new Date()
			})
			.where(eq(dataSource.id, current.id))
			.returning();
		return toView(row);
	} catch (error) {
		throw nameTakenOr(error);
	}
}

export async function deleteDataSource(id: string): Promise<DataSourceView> {
	const current = await findRow(id);
	await getDb().delete(dataSource).where(eq(dataSource.id, current.id));
	return toView(current);
}

/** The secrets of a source, and its connection URL with them, for a reveal that was allowed. */
export async function revealDataSource(id: string): Promise<RevealedSecrets> {
	const row = await findRow(id);
	const secrets = openSecrets(row);
	return {
		secrets,
		connectionUrl: connectionUrl(
			row.type,
			row.settings as unknown as SettingsByType[DataSourceType],
			secrets
		)
	};
}

/** What a connection test needs: the type, the settings and the secrets. */
export async function connectionTarget(id: string): Promise<{
	view: DataSourceView;
	secrets: DataSourceSecrets;
}> {
	const row = await findRow(id);
	return { view: toView(row), secrets: openSecrets(row) };
}

const TEST_MESSAGE_MAX_LENGTH = 1000;

/** Keeps the outcome of a test, and the host key fingerprint a first tunnel trusted. */
export async function recordTest(
	id: string,
	outcome: TestOutcome,
	fingerprint: string | null,
	now = new Date()
): Promise<void> {
	const row = await findRow(id);
	const values: Partial<typeof dataSource.$inferInsert> = {
		testedAt: now,
		testOk: outcome.ok,
		testMessage: outcome.message.slice(0, TEST_MESSAGE_MAX_LENGTH)
	};
	const ssh = sshOf(row.type, row.settings);
	if (fingerprint !== null && ssh !== null && ssh.fingerprint === '') {
		values.settings = { ...row.settings, ssh: { ...ssh, fingerprint } };
	}
	await getDb().update(dataSource).set(values).where(eq(dataSource.id, row.id));
}

export interface DataSourceSearchHit {
	id: string;
	name: string;
	type: DataSourceType;
	description: string;
	score: number;
}

/** Sources whose name contains the query or looks like it, best first. */
export async function searchDataSources(
	query: string,
	limit: number
): Promise<DataSourceSearchHit[]> {
	const trimmed = query.trim();
	if (trimmed.length === 0) {
		return [];
	}
	const pattern = containsPattern(trimmed);
	const score = sql<number>`greatest(
		similarity(${dataSource.name}, ${trimmed}),
		word_similarity(${trimmed}, ${dataSource.name}),
		case when ${dataSource.name} ilike ${pattern} then 0.9 else 0 end
	)::float8`;
	const rows = await getDb()
		.select({
			id: dataSource.id,
			name: dataSource.name,
			type: dataSource.type,
			description: dataSource.description,
			score
		})
		.from(dataSource)
		.where(
			or(
				ilike(dataSource.name, pattern),
				sql`${dataSource.name} % ${trimmed}`,
				sql`${trimmed} <% ${dataSource.name}`
			)
		)
		.orderBy(desc(score), asc(dataSource.name))
		.limit(limit);
	return rows.map((row) => ({ ...row, score: Number(row.score) }));
}

export async function countDataSources(): Promise<number> {
	const [row] = await getDb().select({ total: count() }).from(dataSource);
	return row.total;
}
