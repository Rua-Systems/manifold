/** What the app can show of a file in the browser; any other file is only downloaded. */
export type FileKind = 'image' | 'pdf' | 'audio' | 'video' | 'text' | 'other';

/** A place that shows a file, such as a note or a service icon. A file in use cannot be deleted. */
export interface FileUse {
	fileId: string;
	/** The module of the place. */
	module: string;
	label: string;
	/** The app path of the place. */
	href: string;
	/** The place is in a trash, from where it may still come back. */
	trashed: boolean;
}
