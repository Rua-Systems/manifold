import { describe, expect, it } from 'vitest';
import { pageTitle } from './title';

describe('pageTitle', () => {
	it('puts the section before the organization name', () => {
		expect(pageTitle('Iron Archive', 'Settings')).toBe('Settings · Iron Archive');
	});

	it('uses the organization name alone without a section', () => {
		expect(pageTitle('Iron Archive')).toBe('Iron Archive');
	});
});
