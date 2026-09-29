import type { FieldErrors } from '$lib/types/validation';

export interface Service {
	id: string;
	alias: string;
	url: string;
	iconFileId: string | null;
	position: number;
}

export type MoveDirection = 'up' | 'down';

export interface ServiceView {
	id: string;
	alias: string;
	url: string;
	iconSrc: string | null;
	initial: string;
}

export type ServicesAction = 'create' | 'update' | 'delete' | 'move' | 'reorder';

export interface ServicesFormState {
	action: ServicesAction;
	success: boolean;
	message: string;
	errors: FieldErrors;
}
