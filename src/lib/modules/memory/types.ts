import type { Tag } from '$lib/types/tags';
import type { FieldErrors } from '$lib/types/validation';
import type { NoteContent } from '../notes/content';

/** Who wrote a revision of a memory: the owner, an API key or the app itself. */
export type MemoryActorType = 'owner' | 'api_key' | 'system';

/** A category or subcategory; a subcategory's parent is always a category at the top. */
export interface MemoryCategory {
	id: string;
	name: string;
	/** Null for a category; set for a subcategory. */
	parentId: string | null;
}

/** A category with its subcategories and how many memories outside the trash each holds. */
export interface MemoryCategoryNode extends MemoryCategory {
	count: number;
	children: (MemoryCategory & { count: number })[];
}

export interface MemorySummary {
	id: string;
	title: string;
	excerpt: string;
	/** Null for a memory without a category. */
	categoryId: string | null;
	pinned: boolean;
	tags: Tag[];
	version: number;
	updatedAt: Date;
	deletedAt: Date | null;
}

export interface MemoryDetail {
	id: string;
	title: string;
	content: NoteContent;
	version: number;
	categoryId: string | null;
	pinned: boolean;
	tags: Tag[];
	createdAt: Date;
	updatedAt: Date;
	deletedAt: Date | null;
}

export interface MemoryRevisionSummary {
	version: number;
	title: string;
	actorType: MemoryActorType;
	actorId: string | null;
	/** The API key's name while the key exists; null for the owner, the app or a deleted key. */
	actorName: string | null;
	createdAt: Date;
	updatedAt: Date;
}

/** A revision shown read only in place of the editor. */
export interface MemoryPreview {
	version: number;
	title: string;
	content: NoteContent;
}

export type MemoryCategoriesAction = 'create' | 'rename' | 'delete';

/** What the form actions of the categories page answer. */
export interface MemoryCategoriesFormState {
	action: MemoryCategoriesAction;
	success: boolean;
	message: string;
	errors: FieldErrors;
}
