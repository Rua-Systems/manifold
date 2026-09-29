import { describe, expect, it } from 'vitest';
import {
	defaultSidebarPreferences,
	parseSidebarPreferences,
	serializeSidebarPreferences
} from './sidebar-preferences';

describe('sidebar preferences', () => {
	it('round trips through the cookie value', () => {
		const preferences = { collapsed: true, closedGroups: ['services', 'notes'] };

		expect(parseSidebarPreferences(serializeSidebarPreferences(preferences))).toEqual(
			preferences
		);
	});

	it('falls back to the defaults for missing or broken values', () => {
		for (const raw of [undefined, '', '{', 'null', '"text"', '42']) {
			expect(parseSidebarPreferences(raw)).toEqual(defaultSidebarPreferences());
		}
	});

	it('drops group ids that are not plain strings', () => {
		const raw = JSON.stringify({
			collapsed: 'yes',
			closedGroups: ['services', 7, '', 'x'.repeat(61)]
		});

		expect(parseSidebarPreferences(raw)).toEqual({
			collapsed: false,
			closedGroups: ['services']
		});
	});
});
