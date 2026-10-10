import { actionMessage } from '$lib/utils/actions';
import { sendFile } from './uploads';

export type UploadStatus = 'waiting' | 'sending' | 'done' | 'failed';

export interface UploadItem {
	id: number;
	name: string;
	size: number;
	/** From 0 to 1. */
	progress: number;
	status: UploadStatus;
	message: string;
}

interface Pending {
	item: UploadItem;
	file: File;
	url: string;
	fields: Record<string, string>;
}

export interface UploadQueueOptions {
	maxBytes: number;
	/** The message for a file over the limit, which is not sent at all. */
	tooLarge: string;
	/** The message when the answer says nothing more. */
	failed: string;
	/** Runs when the queue is empty again, to load the page anew. */
	onsettled: () => Promise<void>;
}

/**
 * Files on their way to the Files page, sent one at a time so each shows its own progress and a
 * failed one does not hold up the rest.
 */
export class UploadQueue {
	items = $state<UploadItem[]>([]);

	private pending: Pending[] = [];
	private running = false;
	private nextId = 1;
	private readonly options: UploadQueueOptions;

	constructor(options: UploadQueueOptions) {
		this.options = options;
	}

	get busy(): boolean {
		return this.items.some((item) => item.status === 'waiting' || item.status === 'sending');
	}

	add(files: File[], url: string, fields: Record<string, string>): void {
		for (const file of files) {
			this.items.push({
				id: this.nextId,
				name: file.name,
				size: file.size,
				progress: 0,
				status: 'waiting',
				message: ''
			});
			this.nextId += 1;
			// The pushed object is wrapped by the state; only the wrapper updates the page.
			const item = this.items[this.items.length - 1];
			if (file.size > this.options.maxBytes) {
				item.status = 'failed';
				item.message = this.options.tooLarge;
				continue;
			}
			this.pending.push({ item, file, url, fields });
		}
		void this.run();
	}

	/** Takes finished uploads off the list. */
	clear(): void {
		this.items = this.items.filter(
			(item) => item.status === 'waiting' || item.status === 'sending'
		);
	}

	private async send(next: Pending): Promise<void> {
		const { item } = next;
		item.status = 'sending';
		try {
			const result = await sendFile(next.url, next.fields, next.file, (fraction) => {
				item.progress = fraction;
			});
			if (result.type !== 'success') {
				item.status = 'failed';
				item.message = actionMessage(result, this.options.failed);
				return;
			}
			const turnedDown = result.data?.rejected;
			if (Array.isArray(turnedDown) && turnedDown.length > 0) {
				item.status = 'failed';
				item.message = String(turnedDown[0]?.message ?? this.options.failed);
				return;
			}
			item.progress = 1;
			item.status = 'done';
		} catch {
			item.status = 'failed';
			item.message = this.options.failed;
		}
	}

	private async run(): Promise<void> {
		if (this.running) {
			return;
		}
		this.running = true;
		let next = this.pending.shift();
		while (next !== undefined) {
			await this.send(next);
			next = this.pending.shift();
		}
		this.running = false;
		await this.options.onsettled();
	}
}
