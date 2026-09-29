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
