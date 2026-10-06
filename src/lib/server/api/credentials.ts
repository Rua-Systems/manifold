import { SERVER_MODULES } from '$lib/modules/registry.server';
import type { DashboardStat } from '$lib/types/dashboard';
import type { Actor } from '../actor';
import { authenticateApiKey, type ApiKeyIdentity, type NoteGrant } from '../api-keys';
import { ApiError } from './errors';

// The Bearer credentials of /api/v1, /mcp and /files: API keys of the core, and tokens that a
// module issues, such as the notes module's note tokens.

/** Tokens a module issues that authenticate like API keys, told apart by their start. */
export interface CredentialProvider {
	/** The start of every token of this kind, such as `mfn_`. */
	prefix: string;
	authenticate: (
		presented: string,
		origin: { ip: string | null }
	) => Promise<ApiKeyIdentity | null>;
	/** How many of these tokens work now, for the dashboard's access card. */
	summary?: () => Promise<DashboardStat>;
}

/** The working tokens of every module that issues some, for the dashboard. */
export async function credentialSummaries(): Promise<DashboardStat[]> {
	const providers = SERVER_MODULES.flatMap((module) => module.credentials ?? []);
	const summaries = await Promise.all(providers.map((provider) => provider.summary?.()));
	return summaries.filter((summary) => summary !== undefined);
}

/** The identity behind a presented Bearer token, or null for anything invalid, all alike. */
export async function authenticateCredential(
	presented: string,
	origin: { ip: string | null }
): Promise<ApiKeyIdentity | null> {
	for (const module of SERVER_MODULES) {
		const provider = module.credentials;
		if (provider !== undefined && presented.startsWith(provider.prefix)) {
			return provider.authenticate(presented, origin);
		}
	}
	return authenticateApiKey(presented, origin);
}

/** Who a credential writes as: revisions and the audit log tell keys and note tokens apart. */
export function credentialActor(identity: ApiKeyIdentity): Actor {
	if (identity.note !== undefined) {
		return { type: 'note_token', id: identity.id };
	}
	return { type: 'api_key', id: identity.id };
}

function hasAccess(grant: NoteGrant, needed: NoteGrant['access']): boolean {
	return needed === 'read' || grant.access === 'edit';
}

/** Whether a note token may see a route or tool marked with `noteToken`; API keys always may. */
export function noteTokenMaySee(
	identity: ApiKeyIdentity,
	noteToken: NoteGrant['access'] | undefined
): boolean {
	if (identity.note === undefined) {
		return true;
	}
	return noteToken !== undefined && hasAccess(identity.note, noteToken);
}

/**
 * Stops a note token outside its grant: on a route or tool not marked for note tokens, or one
 * that needs edit access, with 403; on another note than its own with 404, as if that note did
 * not exist. API keys pass; their scopes are checked elsewhere.
 */
export function assertNoteGrant(
	identity: ApiKeyIdentity,
	noteToken: NoteGrant['access'] | undefined,
	params: unknown
): void {
	const grant = identity.note;
	if (grant === undefined) {
		return;
	}
	if (!noteTokenMaySee(identity, noteToken)) {
		throw new ApiError(403, 'insufficient_scope', 'A note token reaches only its own note.');
	}
	if (typeof params === 'object' && params !== null && 'id' in params && params.id !== grant.id) {
		throw new ApiError(404, 'not_found', 'Note was not found.');
	}
}
