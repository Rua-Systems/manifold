import { SERVER_MODULES } from '$lib/modules/registry.server';
import type { SearchHit } from '$lib/types/search';
import type { ApiKeyIdentity } from './api-keys';

// The search: every module's provider answers, and the hits are merged into one list by score.

export interface SearchProvider {
	/** The `type` of the hits it gives. */
	type: string;
	/** The read scope an API key needs to see them. */
	scope: string;
	/** `key` is the API key searching, or null for the owner in the app. */
	search: (query: string, limit: number, key: ApiKeyIdentity | null) => Promise<SearchHit[]>;
}

export const SEARCH_LIMIT_MAX = 50;

export function searchProviders(): SearchProvider[] {
	return SERVER_MODULES.flatMap((module) => module.search ?? []);
}

export interface SearchOptions {
	/** Only these types; all when empty. */
	types?: string[];
	/** Only providers whose scope is in this list, for API keys; all when undefined. */
	scopes?: string[];
	/** The API key searching, for modules that limit a key further than its scopes. */
	key?: ApiKeyIdentity;
	limit?: number;
}

export async function search(query: string, options: SearchOptions = {}): Promise<SearchHit[]> {
	const trimmed = query.trim();
	if (trimmed.length === 0) {
		return [];
	}
	const limit = Math.min(Math.max(options.limit ?? 20, 1), SEARCH_LIMIT_MAX);
	const providers = searchProviders().filter(
		(provider) =>
			(options.types === undefined ||
				options.types.length === 0 ||
				options.types.includes(provider.type)) &&
			(options.scopes === undefined || options.scopes.includes(provider.scope))
	);
	const results = await Promise.all(
		providers.map((provider) => provider.search(trimmed, limit, options.key ?? null))
	);
	return results
		.flat()
		.sort(
			(first, second) => second.score - first.score || first.title.localeCompare(second.title)
		)
		.slice(0, limit);
}
