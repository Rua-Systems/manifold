import { describe, expect, it } from 'vitest';
import { MODULES } from './registry';
import { SERVER_MODULES } from './registry.server';

describe('module registry', () => {
	it('lists every module in both halves', () => {
		const client = MODULES.map((module) => module.id).sort();
		const server = SERVER_MODULES.map((module) => module.id).sort();

		expect(server).toEqual(client);
	});

	it('keeps ids and positions unique', () => {
		expect(new Set(MODULES.map((module) => module.id)).size).toBe(MODULES.length);
		expect(new Set(MODULES.map((module) => module.position)).size).toBe(MODULES.length);
	});

	it('gives group modules a sidebar loader', () => {
		for (const module of MODULES.filter((entry) => entry.sidebar === 'group')) {
			const server = SERVER_MODULES.find((entry) => entry.id === module.id);
			expect(server?.sidebarGroup, module.id).toBeTypeOf('function');
		}
	});

	it('names scopes after their module', () => {
		for (const module of MODULES) {
			for (const scope of module.scopes) {
				expect(scope.id).toMatch(/^[a-z]+:(read|write)$/);
			}
		}
	});
});
