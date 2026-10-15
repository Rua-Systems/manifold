import { m } from '$lib/paraglide/messages.js';
import { localizeHref } from '$lib/paraglide/runtime.js';
import { ownerActor } from '$lib/server/actor';
import { originOf, recordAudit } from '$lib/server/audit';
import { NotFoundError, ValidationError } from '$lib/server/errors';
import { requireUser } from '$lib/server/guard';
import { isSteppedUp, stepUpRequired } from '$lib/server/step-up';
import type { FieldErrors } from '$lib/types/validation';
import { textValue } from '$lib/utils/validation';
import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { testDataSource } from './connect.server';
import {
	changesSecrets,
	createDataSource,
	deleteDataSource,
	getDataSource,
	listDataSources,
	revealDataSource,
	updateDataSource
} from './datasources.server';
import { dataSourceTypeSchema } from './schemas';
import { SECRET_NAMES, type DataSourceType, type SecretName } from './types';

// Loads and form actions behind /data-sources. Every change, test and reveal is recorded in the
// audit log, never with a secret. Revealing secrets and changing them need a step-up, as in the
// vault.

export type DataSourceAction = 'create' | 'update' | 'delete' | 'test' | 'reveal';

export interface DataSourceFormState {
	action: DataSourceAction;
	success: boolean;
	message: string;
	errors: FieldErrors;
}

async function audit(event: RequestEvent, userId: string, action: string, id: string) {
	await recordAudit({
		actor: ownerActor(userId),
		action: `data_source.${action}`,
		target: { type: 'data_source', id },
		origin: originOf(event)
	});
}

function failure(action: DataSourceAction, cause: unknown) {
	if (cause instanceof ValidationError) {
		return fail(400, {
			action,
			success: false,
			message: m.datasources_error_form(),
			errors: cause.fields
		});
	}
	if (cause instanceof NotFoundError) {
		error(404, { message: m.datasources_error_missing() });
	}
	throw cause;
}

function checked(data: FormData, name: string): boolean {
	return data.get(name) === 'on';
}

/** A number field, left out when empty so the schema's default applies. */
function numberField(data: FormData, name: string): string | undefined {
	const value = textValue(data, name).trim();
	if (value === '') {
		return undefined;
	}
	return value;
}

function sshFields(data: FormData) {
	return {
		enabled: checked(data, 'ssh.enabled'),
		host: textValue(data, 'ssh.host'),
		port: numberField(data, 'ssh.port'),
		username: textValue(data, 'ssh.username'),
		auth: textValue(data, 'ssh.auth') || undefined
	};
}

/** The settings of a type, read from the fields of the form. */
export function settingsFromForm(type: DataSourceType, data: FormData): Record<string, unknown> {
	if (type === 'postgresql' || type === 'mysql') {
		return {
			host: textValue(data, 'host'),
			port: numberField(data, 'port'),
			database: textValue(data, 'database'),
			username: textValue(data, 'username'),
			ssl: textValue(data, 'ssl') || undefined,
			ssh: sshFields(data)
		};
	}
	if (type === 'redis') {
		return {
			host: textValue(data, 'host'),
			port: numberField(data, 'port'),
			username: textValue(data, 'username'),
			database: numberField(data, 'database'),
			tls: checked(data, 'tls'),
			ssh: sshFields(data)
		};
	}
	if (type === 's3') {
		return {
			endpoint: textValue(data, 'endpoint'),
			region: textValue(data, 'region'),
			bucket: textValue(data, 'bucket'),
			accessKeyId: textValue(data, 'accessKeyId'),
			pathStyle: checked(data, 'pathStyle')
		};
	}
	if (type === 'api') {
		return {
			baseUrl: textValue(data, 'baseUrl'),
			auth: textValue(data, 'auth') || undefined,
			headerName: textValue(data, 'headerName'),
			username: textValue(data, 'username'),
			testPath: textValue(data, 'testPath')
		};
	}
	return { url: textValue(data, 'url'), auth: textValue(data, 'auth') || undefined };
}

/**
 * The secrets of the form: a filled field sets one, a ticked `remove.<name>` removes it, and an
 * empty field keeps what is stored.
 */
export function secretsFromForm(data: FormData): Partial<Record<SecretName, string | null>> {
	const secrets: Partial<Record<SecretName, string | null>> = {};
	for (const name of SECRET_NAMES) {
		if (checked(data, `remove.${name}`)) {
			secrets[name] = null;
			continue;
		}
		const value = textValue(data, name);
		if (value !== '') {
			secrets[name] = value;
		}
	}
	return secrets;
}

function commonFromForm(data: FormData) {
	return {
		name: textValue(data, 'name'),
		description: textValue(data, 'description'),
		docsUrl: textValue(data, 'docsUrl')
	};
}

/** The type of an address or a form, PostgreSQL when it names none. */
export function typeOf(value: string | null): DataSourceType {
	const parsed = dataSourceTypeSchema.safeParse(value);
	if (parsed.success) {
		return parsed.data;
	}
	return 'postgresql';
}

export async function loadDataSourcesPage(url: URL) {
	let type: DataSourceType | undefined;
	const requested = url.searchParams.get('type');
	if (requested !== null && requested !== '') {
		type = typeOf(requested);
	}
	const query = (url.searchParams.get('q') ?? '').trim().slice(0, 200);
	return {
		sources: await listDataSources({ type, query }),
		filter: { type: type ?? null, query }
	};
}

export function loadNewDataSource(url: URL) {
	return { type: typeOf(url.searchParams.get('type')) };
}

export async function loadDataSource(id: string) {
	try {
		return { source: await getDataSource(id) };
	} catch (cause) {
		if (cause instanceof NotFoundError) {
			error(404, { message: m.datasources_error_missing() });
		}
		throw cause;
	}
}

async function test(event: RequestEvent) {
	const { user } = requireUser(event.locals);
	const data = await event.request.formData();
	const id = event.params.id ?? textValue(data, 'id');
	try {
		const source = await getDataSource(id);
		const outcome = await testDataSource(source.id);
		await audit(event, user.id, 'test', source.id);
		return {
			action: 'test' as const,
			success: outcome.ok,
			message: outcome.message,
			errors: {},
			durationMs: outcome.durationMs
		};
	} catch (cause) {
		return failure('test', cause);
	}
}

export const newDataSourceActions = {
	create: async (event: RequestEvent) => {
		const { user } = requireUser(event.locals);
		const data = await event.request.formData();
		const type = typeOf(textValue(data, 'type'));
		let id: string;
		try {
			const created = await createDataSource({
				...commonFromForm(data),
				type,
				settings: settingsFromForm(type, data),
				secrets: secretsFromForm(data)
			});
			id = created.id;
			await audit(event, user.id, 'create', id);
		} catch (cause) {
			return failure('create', cause);
		}
		redirect(303, localizeHref(`/data-sources/${id}`));
	}
};

export const dataSourceListActions = { test };

export const dataSourceActions = {
	update: async (event: RequestEvent) => {
		const { user, session } = requireUser(event.locals);
		const data = await event.request.formData();
		const secrets = secretsFromForm(data);
		// Changing a secret is sensitive; the rest is not.
		const sensitive = changesSecrets(secrets);
		if (sensitive && !(await isSteppedUp(session.id))) {
			return stepUpRequired();
		}
		try {
			const current = await getDataSource(event.params.id ?? '');
			await updateDataSource(current.id, {
				...commonFromForm(data),
				settings: settingsFromForm(current.type, data),
				secrets
			});
			let action = 'update';
			if (sensitive) {
				action = 'update_secrets';
			}
			await audit(event, user.id, action, current.id);
		} catch (cause) {
			return failure('update', cause);
		}
		return {
			action: 'update' as const,
			success: true,
			message: m.datasources_updated(),
			errors: {}
		};
	},

	delete: async (event: RequestEvent) => {
		const { user } = requireUser(event.locals);
		try {
			const deleted = await deleteDataSource(event.params.id ?? '');
			await audit(event, user.id, 'delete', deleted.id);
		} catch (cause) {
			return failure('delete', cause);
		}
		redirect(303, localizeHref('/data-sources'));
	},

	test,

	/** The secrets and the connection URL, to show for a while or to put on the clipboard. */
	reveal: async (event: RequestEvent) => {
		const { user, session } = requireUser(event.locals);
		if (!(await isSteppedUp(session.id))) {
			return stepUpRequired();
		}
		const data = await event.request.formData();
		let purpose = 'reveal';
		if (textValue(data, 'purpose') === 'copy') {
			purpose = 'copy';
		}
		try {
			const source = await getDataSource(event.params.id ?? '');
			const revealed = await revealDataSource(source.id);
			await audit(event, user.id, purpose, source.id);
			return { action: 'reveal' as const, success: true, purpose, ...revealed };
		} catch (cause) {
			return failure('reveal', cause);
		}
	}
};
