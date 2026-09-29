import { servicesManifest } from './services/manifest';
import type { ModuleManifest } from './types';

/**
 * Every module, in sidebar order. The sidebar, the command palette, the API scopes and the API
 * documentation are built from this list; a new module only needs to be added here and in
 * registry.server.ts.
 */
export const MODULES: readonly ModuleManifest[] = [servicesManifest].sort(
	(first, second) => first.position - second.position
);
