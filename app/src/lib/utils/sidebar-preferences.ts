export const SIDEBAR_COOKIE = 'manifold_sidebar';

export const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const MAX_GROUPS = 50;
const MAX_GROUP_ID_LENGTH = 60;

/** Stored per browser in a cookie, so the server renders the sidebar the way it was left. */
export interface SidebarPreferences {
	collapsed: boolean;
	/** Groups are open unless listed here, so a new module's group starts open. */
	closedGroups: string[];
}

export function defaultSidebarPreferences(): SidebarPreferences {
	return { collapsed: false, closedGroups: [] };
}

function isGroupId(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0 && value.length <= MAX_GROUP_ID_LENGTH;
}

export function parseSidebarPreferences(raw: string | undefined): SidebarPreferences {
	if (raw === undefined || raw.length === 0) {
		return defaultSidebarPreferences();
	}

	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return defaultSidebarPreferences();
	}
	if (typeof value !== 'object' || value === null) {
		return defaultSidebarPreferences();
	}

	const candidate = value as Record<string, unknown>;
	let closedGroups: string[] = [];
	if (Array.isArray(candidate.closedGroups)) {
		closedGroups = candidate.closedGroups.filter(isGroupId).slice(0, MAX_GROUPS);
	}
	return { collapsed: candidate.collapsed === true, closedGroups };
}

export function serializeSidebarPreferences(preferences: SidebarPreferences): string {
	return JSON.stringify({
		collapsed: preferences.collapsed,
		closedGroups: preferences.closedGroups
	});
}
