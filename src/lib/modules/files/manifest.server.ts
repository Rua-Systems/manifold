import { m } from '$lib/paraglide/messages.js';
import { getLocale } from '$lib/paraglide/runtime.js';
import { measureRows } from '$lib/server/usage/measure';
import { formatBytes } from '$lib/utils/format';
import type { ServerModuleManifest } from '../types.server';
import { FILES_MODULE } from './constants';
import { filesDashboard } from './dashboard.server';
import { sourceLabel } from './labels';
import { searchFiles } from './library.server';
import { fileEntry, fileFolder } from './schema.server';

export const filesServerManifest: ServerModuleManifest = {
	id: FILES_MODULE,
	fileReferences: [{ table: 'file_entry', column: 'file_id' }],
	search: {
		type: 'file',
		scope: 'files:read',
		search: async (query, limit) => {
			const locale = getLocale();
			return (await searchFiles(query, limit)).map((item) => {
				let place: string = m.files_title();
				if (!item.inFiles) {
					place = sourceLabel(item.ownerModule);
				}
				return {
					type: 'file',
					id: item.id,
					title: item.name,
					snippet: `${formatBytes(item.sizeBytes, locale)} · ${place}`,
					href: `/files/view/${item.id}`,
					external: false,
					score: item.score
				};
			});
		}
	},
	// The files themselves are counted by the report's upload section, by module.
	usage: async () => {
		const [folders, entries] = await Promise.all([
			measureRows(fileFolder),
			measureRows(fileEntry)
		]);
		return [
			{ id: 'files.folders', label: m.usage_file_folders(), ...folders },
			{ id: 'files.entries', label: m.usage_file_entries(), ...entries }
		];
	},
	dashboard: filesDashboard
};
