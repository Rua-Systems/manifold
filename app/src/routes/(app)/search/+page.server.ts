import { requireUser } from '$lib/server/guard';
import { search } from '$lib/server/search';
import { textValue } from '$lib/utils/validation';
import type { Actions, PageServerLoad } from './$types';

const PAGE_LIMIT = 50;
const WIDGET_LIMIT = 10;

function typesOf(value: string | null): string[] {
	return (value ?? '')
		.split(',')
		.map((type) => type.trim())
		.filter((type) => type.length > 0);
}

/** The search as a page, for `?q=` and browsers without JavaScript. */
export const load: PageServerLoad = async ({ url, locals }) => {
	requireUser(locals);
	const query = (url.searchParams.get('q') ?? '').slice(0, 200);
	return {
		query,
		hits: await search(query, {
			types: typesOf(url.searchParams.get('types')),
			limit: PAGE_LIMIT
		})
	};
};

export const actions = {
	/** The command palette and the sidebar filter ask here while the owner types. */
	search: async ({ request, locals }) => {
		requireUser(locals);
		const data = await request.formData();
		const query = textValue(data, 'q').slice(0, 200);
		return {
			hits: await search(query, {
				types: typesOf(textValue(data, 'types')),
				limit: WIDGET_LIMIT
			})
		};
	}
} satisfies Actions;
