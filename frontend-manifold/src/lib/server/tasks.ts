import { fileReferences, moduleHousekeeping } from '$lib/modules/registry.server';
import { purgeUnreferencedFiles } from './files/files';
import type { HousekeepingTask } from './housekeeping';

/** Core housekeeping plus every task the modules register. */
export function housekeepingTasks(): HousekeepingTask[] {
	return [
		{
			name: 'files.purge-unreferenced',
			run: async (now) => {
				await purgeUnreferencedFiles(fileReferences(), now);
			}
		},
		...moduleHousekeeping()
	];
}
