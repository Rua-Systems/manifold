import type { Tag } from '$lib/types/tags';

/** A prompt as the pages and the API show it. */
export interface Prompt {
	id: string;
	/** The handle, such as `code-review`, that the MCP server offers it under. */
	name: string;
	title: string;
	description: string;
	body: string;
	/** The names of its `{{name}}` places, in order. */
	variables: string[];
	categoryId: string | null;
	tags: Tag[];
	version: number;
	createdAt: Date;
	updatedAt: Date;
}
