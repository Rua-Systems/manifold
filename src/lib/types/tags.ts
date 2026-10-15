import type { FieldErrors } from './validation';

/** The colors a tag can have; the themes define each for light and dark. */
export const TAG_COLORS = [
	'gray',
	'green',
	'teal',
	'blue',
	'violet',
	'rose',
	'amber',
	'red'
] as const;

export type TagColor = (typeof TAG_COLORS)[number];

/** A global tag, as the owner keeps it in Settings → Tags. */
export interface Tag {
	id: string;
	name: string;
	color: TagColor;
}

export type TagsAction = 'create' | 'update' | 'delete';

/** What the form actions of Settings → Tags answer. */
export interface TagsFormState {
	action: TagsAction;
	success: boolean;
	message: string;
	errors: FieldErrors;
}
