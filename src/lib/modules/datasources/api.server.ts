import { ValidationError } from '$lib/server/errors';
import { defineRoute, type ApiRoute } from '$lib/server/api/types';
import type { FieldErrors } from '$lib/types/validation';
import { z } from 'zod';
import { testDataSource } from './connect.server';
import {
	createDataSource,
	deleteDataSource,
	getDataSource,
	listDataSources,
	revealDataSource,
	updateDataSource
} from './datasources.server';
import { DATA_SOURCE_DESCRIPTION_MAX_LENGTH, DATA_SOURCE_NAME_MAX_LENGTH } from './schemas';
import { DATA_SOURCE_TYPES, SECRET_NAMES, type DataSourceView } from './types';

// /api/v1/data-sources: the functions of the Data Sources page for scripts and agents. The API
// speaks snake_case like the rest of /api/v1, the module camelCase; keys are turned at the edge.
// Secrets only leave through /secrets, behind the datasources:secrets scope.

const TAG = 'data-sources';

function snake(key: string): string {
	return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function camel(key: string): string {
	return key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The same object with every key turned by `turn`, nested objects included. */
function renameKeys(value: unknown, turn: (key: string) => string): unknown {
	if (!isPlainObject(value)) {
		return value;
	}
	return Object.fromEntries(
		Object.entries(value).map(([key, item]) => [turn(key), renameKeys(item, turn)])
	);
}

const COMMON_FIELDS = new Set(['name', 'description', 'docsUrl', 'type']);

/** Field errors of the module, named as the request named the fields. */
function apiFields(fields: FieldErrors): FieldErrors {
	const named: FieldErrors = {};
	for (const [key, message] of Object.entries(fields)) {
		const path = key.split('.').map(snake).join('.');
		if (COMMON_FIELDS.has(key)) {
			named[path] = message;
		} else if ((SECRET_NAMES as readonly string[]).includes(key)) {
			named[`secrets.${path}`] = message;
		} else {
			named[`settings.${path}`] = message;
		}
	}
	return named;
}

async function withApiFields<T>(work: Promise<T>): Promise<T> {
	try {
		return await work;
	} catch (cause) {
		if (cause instanceof ValidationError) {
			throw new ValidationError(apiFields(cause.fields));
		}
		throw cause;
	}
}

const idParams = z.object({ id: z.string().meta({ description: 'The data source id.' }) });

const typeField = z.enum(DATA_SOURCE_TYPES).meta({
	description:
		'`postgresql`, `mysql` (MySQL and MariaDB), `redis`, `s3` (S3 and compatible services), `api` (an HTTP API) or `link` (an address such as a CDN file).'
});

const settingsField = z.record(z.string(), z.unknown()).meta({
	description:
		'The fields of the type, without secrets. postgresql and mysql: host, port, database, username, ssl (`disable`, `require`, `verify`) and ssh. redis: host, port, username, database (0 to 15), tls and ssh. ssh: enabled, host, port, username, auth (`password` or `key`); fingerprint is read only. s3: endpoint (empty for AWS), region, bucket, access_key_id, path_style. api: base_url, auth (`none`, `bearer`, `header`, `basic`), header_name, username, test_path. link: url, auth (`none` or `bearer`).'
});

const secretsField = z.record(z.string(), z.string().nullable()).meta({
	description:
		'Secrets to set, or null to remove one: password, token, secret_access_key, ssh_password, ssh_private_key, ssh_passphrase. Left out, a stored secret stays.'
});

const lastTestResource = z
	.object({ at: z.string(), ok: z.boolean(), message: z.string() })
	.nullable()
	.meta({ description: 'The last connection test, or null before the first one.' });

const sourceResource = z.object({
	id: z.string(),
	name: z.string(),
	type: z.enum(DATA_SOURCE_TYPES),
	description: z.string(),
	docs_url: z.string().nullable(),
	settings: z.record(z.string(), z.unknown()),
	secrets: z.array(z.string()).meta({
		description: 'The secrets that hold a value, never the values.'
	}),
	last_test: lastTestResource,
	created_at: z.string(),
	updated_at: z.string()
});

const outcomeResource = z.object({
	ok: z.boolean(),
	message: z.string().meta({ description: 'What was found, or why it failed.' }),
	duration_ms: z.number().int()
});

function toResource(source: DataSourceView): z.output<typeof sourceResource> {
	let lastTest: z.output<typeof lastTestResource> = null;
	if (source.lastTest !== null) {
		lastTest = {
			at: source.lastTest.at.toISOString(),
			ok: source.lastTest.ok,
			message: source.lastTest.message
		};
	}
	return {
		id: source.id,
		name: source.name,
		type: source.type,
		description: source.description,
		docs_url: source.docsUrl,
		settings: renameKeys(source.settings, snake) as Record<string, unknown>,
		secrets: source.secrets.map(snake),
		last_test: lastTest,
		created_at: source.createdAt.toISOString(),
		updated_at: source.updatedAt.toISOString()
	};
}

export const dataSourcesApiRoutes: ApiRoute[] = [
	defineRoute({
		method: 'GET',
		path: '/data-sources',
		scope: 'datasources:read',
		tag: TAG,
		summary: 'List data sources by name',
		query: z.object({
			type: z.enum(DATA_SOURCE_TYPES).optional().meta({ description: 'Only one type.' }),
			q: z
				.string()
				.max(200)
				.optional()
				.meta({ description: 'Matches the name, the description and the settings.' })
		}),
		response: {
			status: 200,
			description: 'Every matching source, without secrets.',
			schema: z.object({ data: z.array(sourceResource) })
		},
		handler: async ({ query }) => ({
			body: {
				data: (await listDataSources({ type: query.type, query: query.q })).map(toResource)
			}
		})
	}),
	defineRoute({
		method: 'POST',
		path: '/data-sources',
		scope: 'datasources:write',
		tag: TAG,
		summary: 'Add a data source',
		description: `A name of up to ${DATA_SOURCE_NAME_MAX_LENGTH} characters, unique whatever its case, and a description of up to ${DATA_SOURCE_DESCRIPTION_MAX_LENGTH}.`,
		body: z.object({
			name: z.string().max(DATA_SOURCE_NAME_MAX_LENGTH),
			type: typeField,
			description: z.string().max(DATA_SOURCE_DESCRIPTION_MAX_LENGTH).optional(),
			docs_url: z.string().max(2000).optional(),
			settings: settingsField,
			secrets: secretsField.optional()
		}),
		response: { status: 201, description: 'The new source.', schema: sourceResource },
		audit: 'data_source.create',
		handler: async ({ body }) => {
			const created = await withApiFields(
				createDataSource({
					name: body.name,
					type: body.type,
					description: body.description,
					docsUrl: body.docs_url,
					settings: renameKeys(body.settings, camel),
					secrets: renameKeys(body.secrets ?? {}, camel)
				})
			);
			return {
				status: 201,
				body: toResource(created),
				target: { type: 'data_source', id: created.id }
			};
		}
	}),
	defineRoute({
		method: 'GET',
		path: '/data-sources/{id}',
		scope: 'datasources:read',
		tag: TAG,
		summary: 'Read a data source',
		params: idParams,
		response: {
			status: 200,
			description: 'The source, without secrets.',
			schema: sourceResource
		},
		handler: async ({ params }) => ({ body: toResource(await getDataSource(params.id)) })
	}),
	defineRoute({
		method: 'GET',
		path: '/data-sources/{id}/secrets',
		scope: 'datasources:secrets',
		tag: TAG,
		summary: "Read a data source's secrets",
		description:
			'The passwords, tokens and keys of the source, and its connection URL where the type has one. Every read is recorded in the audit log.',
		params: idParams,
		response: {
			status: 200,
			description: 'The secrets.',
			schema: z.object({
				secrets: z.record(z.string(), z.string()),
				connection_url: z.string().nullable()
			})
		},
		audit: 'data_source.reveal',
		handler: async ({ params }) => {
			const found = await getDataSource(params.id);
			const revealed = await revealDataSource(found.id);
			return {
				body: {
					secrets: renameKeys(revealed.secrets, snake) as Record<string, string>,
					connection_url: revealed.connectionUrl
				},
				target: { type: 'data_source', id: found.id }
			};
		}
	}),
	defineRoute({
		method: 'PATCH',
		path: '/data-sources/{id}',
		scope: 'datasources:write',
		tag: TAG,
		summary: 'Change a data source',
		description:
			'What is left out stays. `settings`, when sent, replaces the settings as a whole; `secrets` changes only the secrets it names. The type cannot change.',
		params: idParams,
		body: z.object({
			name: z.string().max(DATA_SOURCE_NAME_MAX_LENGTH).optional(),
			description: z.string().max(DATA_SOURCE_DESCRIPTION_MAX_LENGTH).optional(),
			docs_url: z.string().max(2000).nullable().optional(),
			settings: settingsField.optional(),
			secrets: secretsField.optional()
		}),
		response: { status: 200, description: 'The changed source.', schema: sourceResource },
		audit: 'data_source.update',
		handler: async ({ params, body }) => {
			const current = await getDataSource(params.id);
			let settings: unknown = current.settings;
			if (body.settings !== undefined) {
				settings = renameKeys(body.settings, camel);
			}
			let docsUrl = current.docsUrl ?? '';
			if (body.docs_url !== undefined) {
				docsUrl = body.docs_url ?? '';
			}
			const updated = await withApiFields(
				updateDataSource(current.id, {
					name: body.name ?? current.name,
					description: body.description ?? current.description,
					docsUrl,
					settings,
					secrets: renameKeys(body.secrets ?? {}, camel)
				})
			);
			return { body: toResource(updated), target: { type: 'data_source', id: updated.id } };
		}
	}),
	defineRoute({
		method: 'DELETE',
		path: '/data-sources/{id}',
		scope: 'datasources:write',
		tag: TAG,
		summary: 'Delete a data source',
		description: 'The source and its secrets are deleted for good.',
		params: idParams,
		response: { status: 204, description: 'The source is gone.' },
		audit: 'data_source.delete',
		handler: async ({ params }) => {
			const deleted = await deleteDataSource(params.id);
			return { status: 204, target: { type: 'data_source', id: deleted.id } };
		}
	}),
	defineRoute({
		method: 'POST',
		path: '/data-sources/{id}/test',
		scope: 'datasources:write',
		tag: TAG,
		summary: 'Test the connection of a data source',
		description:
			'The server connects with the stored settings and secrets and reads something harmless, such as the server version, then closes. Nothing is written to the source. The outcome is kept as `last_test`.',
		params: idParams,
		response: { status: 200, description: 'The outcome of the test.', schema: outcomeResource },
		audit: 'data_source.test',
		handler: async ({ params }) => {
			const found = await getDataSource(params.id);
			const outcome = await testDataSource(found.id);
			return {
				body: { ok: outcome.ok, message: outcome.message, duration_ms: outcome.durationMs },
				target: { type: 'data_source', id: found.id }
			};
		}
	})
];
