import { m } from '$lib/paraglide/messages.js';
import type { DashboardCard } from '$lib/types/dashboard';
import { fileTotals, recentFiles } from './library.server';

const RECENT_FILES = 6;

/** How many files there are, of which kind, how much room they take, and the latest ones. */
export async function filesDashboard(): Promise<DashboardCard[]> {
	const [totals, recent] = await Promise.all([fileTotals(), recentFiles(RECENT_FILES)]);
	const kind = (id: string) => totals.byKind.get(id) ?? 0;
	return [
		{
			id: 'files',
			title: m.files_title(),
			href: '/files',
			blocks: [
				{
					kind: 'stats',
					stats: [
						{
							id: 'files',
							label: m.dashboard_files(),
							value: totals.files,
							unit: 'count'
						},
						{
							id: 'size',
							label: m.dashboard_files_size(),
							value: totals.bytes,
							unit: 'bytes'
						},
						{
							id: 'images',
							label: m.files_kind_image(),
							value: kind('image'),
							unit: 'count'
						},
						{ id: 'pdf', label: m.files_kind_pdf(), value: kind('pdf'), unit: 'count' },
						{
							id: 'media',
							label: m.dashboard_files_media(),
							value: kind('audio') + kind('video'),
							unit: 'count'
						},
						{
							id: 'other',
							label: m.dashboard_files_other(),
							value: kind('text') + kind('other'),
							unit: 'count'
						}
					]
				},
				{
					kind: 'links',
					id: 'recent',
					title: m.dashboard_files_recent(),
					empty: m.dashboard_files_empty(),
					links: recent.map((item) => ({
						id: item.id,
						label: item.name,
						href: `/files/view/${item.id}`,
						external: false,
						time: item.createdAt
					}))
				}
			]
		}
	];
}
