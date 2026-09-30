import { SERVER_MODULES } from '$lib/modules/registry.server';
import type { SearchHit } from '$lib/types/search';

// The search: every module's provider answers, and the hits are merged into one list by score.

export interface SearchProvider {
	/** The `type` of the hits it gives. */
	type: string;
	/** The read scope an API key needs to see them. */
	scope: string;
	search: (query: string, limit: number) => Promise<SearchHit[]>;
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
	const results = await Promise.all(providers.map((provider) => provider.search(trimmed, limit)));
	return results
		.flat()
		.sort(
			(first, second) => second.score - first.score || first.title.localeCompare(second.title)
		)
		.slice(0, limit);
}
