import { filePreviewActions, loadFilePreview } from '#lib/modules/files/preview.page.server.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => loadFilePreview(params.id);

export const actions = filePreviewActions satisfies Actions;
