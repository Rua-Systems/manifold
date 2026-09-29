import { notesManifest } from './notes/manifest';
import { servicesManifest } from './services/manifest';
import type { ModuleManifest } from './types';

/**
 * Every module, in sidebar order. The sidebar, the command palette, the API scopes and the API
 * documentation are built from this list; a new module only needs to be added here and in
 * registry.server.ts.
 */
export const MODULES: readonly ModuleManifest[] = [servicesManifest, notesManifest].sort(
	(first, second) => first.position - second.position
);

/** Dependency of the sidebar's `load`, invalidated after writes that change what it lists. */
export const SIDEBAR_DEPENDENCY = 'app:sidebar';
