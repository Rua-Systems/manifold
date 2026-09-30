import { fileReferences, moduleHousekeeping } from '$lib/modules/registry.server';
import { purgeAuditEvents } from './audit';
import { getEnv } from './env';
import { purgeUnreferencedFiles } from './files/files';
import type { HousekeepingTask } from './housekeeping';

/**
 * Every task the modules register, then the core ones. Module purges run first, so files they
 * leave unreferenced are removed in the same run.
 */
export function housekeepingTasks(): HousekeepingTask[] {
	return [
		...moduleHousekeeping(),
		{
			name: 'files.purge-unreferenced',
			run: async (now) => {
				await purgeUnreferencedFiles(fileReferences(), now);
			}
		},
		{
			name: 'audit.purge',
			run: async (now) => {
				await purgeAuditEvents(now, getEnv().AUDIT_RETENTION_DAYS);
			}
		}
	];
}
