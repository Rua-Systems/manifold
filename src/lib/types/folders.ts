/** A folder as a folder picker needs it, in any module that nests folders. */
export interface FolderOption {
	id: string;
	name: string;
	/** Null for a folder at the top level. */
	parentId: string | null;
}
