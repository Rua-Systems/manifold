import type { FileKind, FileUse } from '$lib/types/files';
import type { FieldErrors } from '$lib/types/validation';

export type FilesSort = 'newest' | 'oldest' | 'name' | 'size';

export type FilesKindFilter = FileKind | 'all';

/** What the Files page lists when a filter is set: matching files from everywhere. */
export interface FilesFilter {
	query: string;
	kind: FilesKindFilter;
	/** Only files that no note, service or other place shows. */
	unused: boolean;
}

export interface FolderSummary {
	id: string;
	name: string;
	parentId: string | null;
	/** Folders and files directly inside. */
	itemCount: number;
}

/** The files another module keeps, listed like a folder that cannot be changed. */
export interface SourceSummary {
	module: string;
	label: string;
	fileCount: number;
}

export interface FolderCrumb {
	id: string;
	name: string;
}

export interface FileSummary {
	id: string;
	name: string;
	mimeType: string;
	kind: FileKind;
	sizeBytes: number;
	createdAt: Date;
	ownerModule: string;
	/** Kept by the Files module, so it can be renamed, moved and filed in folders. */
	inFiles: boolean;
	folderId: string | null;
	uses: FileUse[];
}

/** Where a file lives, for its preview page and for search results. */
export type FileLocation =
	{ kind: 'folder'; path: FolderCrumb[] } | { kind: 'source'; module: string; label: string };

/** A file with where it lives. */
export interface FileDetail extends FileSummary {
	location: FileLocation;
}

/** What the Files page shows: a folder (the top for null), the files of a module, or a filter. */
export type FilesView =
	| {
			kind: 'folder';
			folderId: string | null;
			path: FolderCrumb[];
			folders: FolderSummary[];
			/** At the top only: the modules that keep files of their own. */
			sources: SourceSummary[];
			files: FileSummary[];
	  }
	| { kind: 'source'; source: SourceSummary; files: FileSummary[] }
	| { kind: 'filter'; files: FileSummary[] };

export type FilesAction =
	| 'createFolder'
	| 'renameFolder'
	| 'moveFolder'
	| 'deleteFolder'
	| 'upload'
	| 'renameFile'
	| 'moveFile'
	| 'deleteFile';

export interface FilesFormState {
	action: FilesAction;
	success: boolean;
	message: string;
	errors: FieldErrors;
	/** For `upload`: the files kept, and those turned down with the reason. */
	uploaded?: number;
	rejected?: { name: string; message: string }[];
}
