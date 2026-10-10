import type { FileKind } from '$lib/types/files';

// The types files are stored and served as. The server picks one of them from the content of an
// upload; the browser reads them only to choose a preview.

/** The type of every file that has no preview: served as a download, never shown inline. */
export const DOWNLOAD_TYPE = 'application/octet-stream';

const KINDS = new Map<string, FileKind>([
	['image/png', 'image'],
	['image/jpeg', 'image'],
	['image/gif', 'image'],
	['image/webp', 'image'],
	['image/svg+xml', 'image'],
	['application/pdf', 'pdf'],
	['audio/mpeg', 'audio'],
	['audio/wav', 'audio'],
	['audio/ogg', 'audio'],
	['audio/flac', 'audio'],
	['audio/mp4', 'audio'],
	['video/mp4', 'video'],
	['video/webm', 'video'],
	['video/quicktime', 'video'],
	['text/plain', 'text'],
	['text/markdown', 'text'],
	['text/csv', 'text'],
	['application/json', 'text']
]);

export function fileKind(mimeType: string): FileKind {
	return KINDS.get(mimeType) ?? 'other';
}

/** Whether a file of this type may be shown inline; every other one is sent as a download. */
export function isPreviewable(mimeType: string): boolean {
	return fileKind(mimeType) !== 'other';
}
