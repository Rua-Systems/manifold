import type { NoteContent } from './content';

export interface NoteSummary {
	id: string;
	title: string;
	excerpt: string;
	updatedAt: Date;
	deletedAt: Date | null;
}

export interface NoteDetail {
	id: string;
	title: string;
	content: NoteContent;
	version: number;
	createdAt: Date;
	updatedAt: Date;
	deletedAt: Date | null;
}

export interface NoteRevisionSummary {
	version: number;
	title: string;
	actorType: 'owner' | 'api_key' | 'system';
	actorId: string | null;
	createdAt: Date;
	updatedAt: Date;
}

/** A revision shown read only in place of the editor. */
export interface NotePreview {
	version: number;
	title: string;
	content: NoteContent;
}

/** A note as the editor needs it: the current state, its history and an optional preview. */
export interface NoteData {
	note: NoteDetail;
	revisions: NoteRevisionSummary[];
	preview: NotePreview | null;
}

/**
 * What the editor needs from a host that shows it outside the note page, such as the map's
 * feature panel: loading the note without navigating, and leaving once the note is trashed.
 */
export interface NoteEditorHost {
	/** Loads the note again, previewing `revision` when it is not null. */
	load: (revision: number | null) => Promise<void>;
	ontrashed: () => void;
}
