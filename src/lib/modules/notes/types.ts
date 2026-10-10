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

/** Who wrote a revision: the owner, an API key, a note token or the app itself. */
export type RevisionActorType = 'owner' | 'api_key' | 'note_token' | 'system';

/** A stored file the editor puts into a note: an image inline, anything else as a link. */
export interface AttachedFile {
	/** `/files/<id>`. */
	src: string;
	name: string;
	sizeBytes: number;
	mimeType: string;
}

export interface NoteRevisionSummary {
	version: number;
	title: string;
	actorType: RevisionActorType;
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

/** What a note token allows on its note. */
export type NoteTokenAccess = 'read' | 'edit';

/** A note token as the note page and Settings list it; the token itself is never stored. */
export interface NoteTokenView {
	id: string;
	noteId: string;
	/** The note's title, empty for an untitled note. */
	noteTitle: string;
	name: string;
	access: NoteTokenAccess;
	prefix: string;
	expiresAt: Date;
	lastUsedAt: Date | null;
	lastUsedIp: string | null;
	revokedAt: Date | null;
	createdAt: Date;
}

/** A note opened with a note token on /shared: what the visitor sees, and what they may do. */
export interface SharedNote {
	id: string;
	title: string;
	content: NoteContent;
	version: number;
	access: NoteTokenAccess;
	expiresAt: Date;
}
