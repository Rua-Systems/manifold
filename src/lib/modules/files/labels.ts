import { m } from '$lib/paraglide/messages.js';
import { MODULES } from '$lib/modules/registry';
import type { FileKind } from '$lib/types/files';

// Names shown for kinds of files and for the modules that keep files of their own. Browser safe,
// so the page and the server name them alike.

/** The owner of files uploaded through the API; see API_FILE_OWNER on the server. */
const API_OWNER = 'api';

const KIND_LABELS: Record<FileKind, () => string> = {
	image: m.files_kind_image,
	pdf: m.files_kind_pdf,
	audio: m.files_kind_audio,
	video: m.files_kind_video,
	text: m.files_kind_text,
	other: m.files_kind_other
};

export function kindLabel(kind: FileKind): string {
	return KIND_LABELS[kind]();
}

/** The name of a module whose files the Files page lists as a source. */
export function sourceLabel(module: string): string {
	if (module === API_OWNER) {
		return m.files_source_api();
	}
	return MODULES.find((item) => item.id === module)?.label() ?? module;
}

/** Sidebar order for module sources; the API and unknown owners come last. */
export function sourceRank(module: string): number {
	const index = MODULES.findIndex((item) => item.id === module);
	if (index === -1) {
		return MODULES.length;
	}
	return index;
}
