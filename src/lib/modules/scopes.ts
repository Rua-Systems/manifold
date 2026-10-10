import { m } from '$lib/paraglide/messages.js';
import { MODULES } from './registry';
import type { ApiScope } from './types';

// Every API scope: those of the modules, from their manifests, and the core's own.

export interface ScopeGroup {
	id: string;
	label: () => string;
	scopes: ApiScope[];
}

/** The usage report belongs to the core, not to a module. */
const CORE_GROUPS: ScopeGroup[] = [
	{
		id: 'usage',
		label: m.scope_group_usage,
		scopes: [{ id: 'usage:read', access: 'read', label: m.scope_usage_read }]
	}
];

export function scopeGroups(): ScopeGroup[] {
	return [
		...MODULES.map((module) => ({ id: module.id, label: module.label, scopes: module.scopes })),
		...CORE_GROUPS
	];
}

export function allScopeIds(): string[] {
	return scopeGroups().flatMap((group) => group.scopes.map((scope) => scope.id));
}

/** The read scope that goes with a write scope, such as `notes:read` for `notes:write`. */
export function readScopeFor(scopeId: string): string | null {
	const scope = scopeGroups()
		.flatMap((group) => group.scopes)
		.find((item) => item.id === scopeId);
	if (scope === undefined || scope.access !== 'write') {
		return null;
	}
	const read = scopeId.replace(/:write$/, ':read');
	return allScopeIds().includes(read) ? read : null;
}
