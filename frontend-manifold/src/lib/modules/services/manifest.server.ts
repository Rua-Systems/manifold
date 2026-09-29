import { m } from '$lib/paraglide/messages.js';
import type { SidebarItem } from '../types';
import type { ServerModuleManifest } from '../types.server';
import { servicesApiRoutes } from './api.server';
import { listServices, SERVICES_MODULE } from './services.server';
import type { Service } from './types';

export function serviceIconSource(item: Service): string | null {
	if (item.iconFileId === null) {
		return null;
	}
	return `/files/${item.iconFileId}`;
}

export function serviceInitial(alias: string): string {
	return (Array.from(alias.trim())[0] ?? '?').toLocaleUpperCase();
}

function toSidebarItem(item: Service): SidebarItem {
	const source = serviceIconSource(item);
	let icon: SidebarItem['icon'] = { kind: 'letter', letter: serviceInitial(item.alias) };
	if (source !== null) {
		icon = { kind: 'image', src: source };
	}
	return { id: item.id, label: item.alias, link: { kind: 'external', url: item.url }, icon };
}

export const servicesServerManifest: ServerModuleManifest = {
	id: SERVICES_MODULE,
	sidebarGroup: async () => {
		const services = await listServices();
		return {
			items: [
				...services.map(toSidebarItem),
				{
					id: 'manage',
					label: m.services_manage(),
					link: { kind: 'internal', path: '/services' }
				}
			]
		};
	},
	fileReferences: [{ table: 'service', column: 'icon_file_id' }],
	api: servicesApiRoutes
};
