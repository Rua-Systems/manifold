import type { NoteContent } from './content';

/** What the save indicator shows. `idle` is a new note nobody has typed into yet. */
export type SaveStatus = 'idle' | 'saved' | 'unsaved' | 'saving' | 'failed' | 'conflict';

export interface SaveRequest {
	/** Null until the note exists; the first save creates it. */
	id: string | null;
	title: string;
	content: NoteContent;
	/** The version the edit was based on, null for a note that does not exist yet. */
	version: number | null;
}

export type SaveResponse =
	| { kind: 'saved'; id: string; version: number }
	| { kind: 'conflict'; currentVersion: number }
	| { kind: 'failed'; message: string };

export interface DraftState {
	id: string | null;
	title: string;
	content: NoteContent;
	version: number | null;
}

export interface DraftOptions {
	send: (request: SaveRequest) => Promise<SaveResponse>;
	onsaved?: (request: SaveRequest, response: { id: string; version: number }) => void;
	onfailed?: (message: string) => void;
	/** Milliseconds between the last change and the automatic save. */
	delay?: number;
}

const AUTOSAVE_DELAY = 1500;

/**
 * The editing state of one note and its autosave: saves 1.5 s after the last change or when
 * asked (on blur), never two at once, and keeps the edit when the server reports a conflict.
 */
export class NoteDraft {
	id = $state<string | null>(null);
	title = $state('');
	version = $state<number | null>(null);
	status = $state<SaveStatus>('idle');

	/** Not reactive: the editor owns the live document, this is only the copy that gets sent. */
	content: NoteContent;

	/** The version another writer saved, known after a conflict. */
	private conflictVersion: number | null = null;
	private dirty = false;
	private timer: ReturnType<typeof setTimeout> | undefined;
	private saving: Promise<void> | null = null;
	private readonly options: DraftOptions;

	constructor(initial: DraftState, options: DraftOptions) {
		this.id = initial.id;
		this.title = initial.title;
		this.content = initial.content;
		this.version = initial.version;
		this.status = initial.id === null ? 'idle' : 'saved';
		this.options = options;
	}

	get hasUnsavedChanges(): boolean {
		return this.dirty || this.saving !== null;
	}

	edit(changes: { title?: string; content?: NoteContent }): void {
		if (changes.title !== undefined) {
			this.title = changes.title;
		}
		if (changes.content !== undefined) {
			this.content = changes.content;
		}
		this.dirty = true;
		if (this.status !== 'conflict' && this.status !== 'saving') {
			this.status = 'unsaved';
		}
		this.cancelTimer();
		this.timer = setTimeout(() => void this.flush(), this.options.delay ?? AUTOSAVE_DELAY);
	}

	/** Saves pending changes now. Waits for a save in flight first, so writes never overlap. */
	async flush(): Promise<void> {
		this.cancelTimer();
		while (this.saving !== null) {
			await this.saving;
		}
		if (!this.dirty || this.status === 'conflict') {
			return;
		}
		this.saving = this.save();
		try {
			await this.saving;
		} finally {
			this.saving = null;
		}
	}

	/** "Keep mine": the local edit is saved on top of the version that caused the conflict. */
	async keepMine(): Promise<void> {
		if (this.status !== 'conflict' || this.conflictVersion === null) {
			return;
		}
		this.version = this.conflictVersion;
		this.conflictVersion = null;
		this.status = 'unsaved';
		await this.flush();
	}

	/** Replaces the local state with the server's, dropping unsaved changes. */
	reset(state: DraftState): void {
		this.cancelTimer();
		this.id = state.id;
		this.title = state.title;
		this.content = state.content;
		this.version = state.version;
		this.conflictVersion = null;
		this.dirty = false;
		this.status = state.id === null ? 'idle' : 'saved';
	}

	/**
	 * Takes a newer server state (a restored revision, a write from elsewhere) when nothing local
	 * would be lost. Returns whether it did.
	 */
	adopt(state: DraftState): boolean {
		if (state.id !== this.id || state.version === null || this.hasUnsavedChanges) {
			return false;
		}
		if (this.version !== null && state.version <= this.version) {
			return false;
		}
		this.reset(state);
		return true;
	}

	/** Stops the timer, for example when the note is about to be trashed. */
	close(): void {
		this.cancelTimer();
		this.dirty = false;
	}

	private cancelTimer(): void {
		if (this.timer !== undefined) {
			clearTimeout(this.timer);
			this.timer = undefined;
		}
	}

	private async save(): Promise<void> {
		this.dirty = false;
		this.status = 'saving';
		const request: SaveRequest = {
			id: this.id,
			title: this.title,
			content: this.content,
			version: this.version
		};

		let response: SaveResponse;
		try {
			response = await this.options.send(request);
		} catch {
			response = { kind: 'failed', message: '' };
		}

		switch (response.kind) {
			case 'saved':
				this.id = response.id;
				this.version = response.version;
				this.status = this.dirty ? 'unsaved' : 'saved';
				this.options.onsaved?.(request, response);
				break;
			case 'conflict':
				this.dirty = true;
				this.conflictVersion = response.currentVersion;
				this.status = 'conflict';
				break;
			case 'failed':
				this.dirty = true;
				this.status = 'failed';
				this.options.onfailed?.(response.message);
				break;
		}
	}
}
