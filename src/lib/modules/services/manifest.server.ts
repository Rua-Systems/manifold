import { m } from '$lib/paraglide/messages.js';
import { measureRows } from '$lib/server/usage/measure';
import type { SidebarItem } from '../types';
import type { ServerModuleManifest } from '../types.server';
import { servicesApiRoutes } from './api.server';
import { servicesMcpTools } from './mcp.server';
import { service } from './schema.server';
import { listServices, searchServices, serviceFileUses, SERVICES_MODULE } from './services.server';
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
	fileUses: serviceFileUses,
	api: servicesApiRoutes,
	mcp: servicesMcpTools,
	search: {
		type: 'service',
		scope: 'services:read',
		search: async (query, limit) =>
			(await searchServices(query, limit)).map((item) => ({
				type: 'service',
				id: item.id,
				title: item.alias,
				snippet: item.url,
				href: item.url,
				external: true,
				score: item.score
			}))
	},
	// Icons are uploaded files, which the report counts by module on its own.
	usage: async () => [
		{ id: 'services.services', label: m.usage_services(), ...(await measureRows(service)) }
	],
	dashboard: async () => {
		const services = await listServices();
		return [
			{
				id: 'services',
				title: m.services_title(),
				href: '/services',
				blocks: [
					{
						kind: 'stats',
						stats: [
							{
								id: 'services',
								label: m.dashboard_services(),
								value: services.length,
								unit: 'count'
							}
						]
					},
					{
						kind: 'links',
						id: 'shortcuts',
						title: m.dashboard_services_shortcuts(),
						empty: m.dashboard_services_empty(),
						links: services.map((item) => ({
							id: item.id,
							label: item.alias,
							href: item.url,
							external: true,
							icon: toSidebarItem(item).icon
						}))
					}
				]
			}
		];
	}
};
