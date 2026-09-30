import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NoteContent } from './content';
import { NoteDraft, type SaveRequest, type SaveResponse } from './draft.svelte';

function doc(text: string): NoteContent {
	return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

/** A server stand-in whose answers the test releases one at a time. */
function fakeServer() {
	const requests: SaveRequest[] = [];
	const pending: ((response: SaveResponse) => void)[] = [];
	const send = vi.fn(
		(request: SaveRequest) =>
			new Promise<SaveResponse>((resolve) => {
				requests.push(request);
				pending.push(resolve);
			})
	);
	return {
		send,
		requests,
		async answer(response: SaveResponse): Promise<void> {
			pending.shift()?.(response);
			await vi.runAllTimersAsync();
		}
	};
}

function existing(send: (request: SaveRequest) => Promise<SaveResponse>) {
	return new NoteDraft({ id: 'n1', title: 'Title', content: doc('a'), version: 3 }, { send });
}

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('NoteDraft', () => {
	it('saves 1.5 s after the last change, not before', async () => {
		const server = fakeServer();
		const draft = existing(server.send);

		draft.edit({ content: doc('ab') });
		await vi.advanceTimersByTimeAsync(1000);
		draft.edit({ content: doc('abc') });
		await vi.advanceTimersByTimeAsync(1400);
		expect(server.send).not.toHaveBeenCalled();
		expect(draft.status).toBe('unsaved');

		await vi.advanceTimersByTimeAsync(100);
		expect(server.requests).toEqual([
			{ id: 'n1', title: 'Title', content: doc('abc'), version: 3 }
		]);
		expect(draft.status).toBe('saving');

		await server.answer({ kind: 'saved', id: 'n1', version: 4 });
		expect(draft.status).toBe('saved');
		expect(draft.version).toBe(4);
	});

	it('saves at once when flushed, as on blur', async () => {
		const server = fakeServer();
		const draft = existing(server.send);

		draft.edit({ title: 'New title' });
		const flushed = draft.flush();
		await server.answer({ kind: 'saved', id: 'n1', version: 4 });
		await flushed;

		expect(server.send).toHaveBeenCalledTimes(1);
		expect(server.requests[0].title).toBe('New title');
		expect(draft.status).toBe('saved');
	});

	it('never sends two saves at once and sends later edits on top of the first', async () => {
		const server = fakeServer();
		const draft = existing(server.send);

		draft.edit({ content: doc('b') });
		void draft.flush();
		draft.edit({ content: doc('c') });
		void draft.flush();
		await vi.advanceTimersByTimeAsync(5000);
		expect(server.send).toHaveBeenCalledTimes(1);

		await server.answer({ kind: 'saved', id: 'n1', version: 4 });
		expect(server.send).toHaveBeenCalledTimes(2);
		expect(server.requests[1]).toMatchObject({ content: doc('c'), version: 4 });

		await server.answer({ kind: 'saved', id: 'n1', version: 5 });
		expect(draft.status).toBe('saved');
	});

	it('creates a new note with its first save and updates it afterwards', async () => {
		const server = fakeServer();
		const onsaved = vi.fn();
		const draft = new NoteDraft(
			{ id: null, title: '', content: doc(''), version: null },
			{ send: server.send, onsaved }
		);
		expect(draft.status).toBe('idle');

		draft.edit({ title: 'Fresh' });
		await vi.advanceTimersByTimeAsync(1500);
		expect(server.requests[0]).toMatchObject({ id: null, version: null });
		await server.answer({ kind: 'saved', id: 'n9', version: 1 });
		expect(onsaved).toHaveBeenCalledWith(expect.objectContaining({ id: null }), {
			kind: 'saved',
			id: 'n9',
			version: 1
		});

		draft.edit({ title: 'Fresh start' });
		await vi.advanceTimersByTimeAsync(1500);
		expect(server.requests[1]).toMatchObject({ id: 'n9', version: 1 });
	});

	it('keeps the edit on a conflict and saves it on top with Keep mine', async () => {
		const server = fakeServer();
		const draft = existing(server.send);

		draft.edit({ content: doc('mine') });
		await vi.advanceTimersByTimeAsync(1500);
		await server.answer({ kind: 'conflict', currentVersion: 7 });
		expect(draft.status).toBe('conflict');
		expect(draft.hasUnsavedChanges).toBe(true);

		// Further typing and blurs wait for the owner's choice.
		draft.edit({ content: doc('mine, more') });
		await vi.advanceTimersByTimeAsync(5000);
		await draft.flush();
		expect(server.send).toHaveBeenCalledTimes(1);
		expect(draft.status).toBe('conflict');

		const kept = draft.keepMine();
		expect(server.requests[1]).toMatchObject({ content: doc('mine, more'), version: 7 });
		await server.answer({ kind: 'saved', id: 'n1', version: 8 });
		await kept;
		expect(draft.status).toBe('saved');
	});

	it('drops the edit when reloaded after a conflict', async () => {
		const server = fakeServer();
		const draft = existing(server.send);

		draft.edit({ content: doc('mine') });
		await vi.advanceTimersByTimeAsync(1500);
		await server.answer({ kind: 'conflict', currentVersion: 7 });

		draft.reset({ id: 'n1', title: 'Theirs', content: doc('theirs'), version: 7 });
		expect(draft).toMatchObject({ status: 'saved', title: 'Theirs', version: 7 });
		expect(draft.hasUnsavedChanges).toBe(false);
	});

	it('marks a failed save and retries on the next change', async () => {
		const server = fakeServer();
		const onfailed = vi.fn();
		const draft = new NoteDraft(
			{ id: 'n1', title: 'Title', content: doc('a'), version: 3 },
			{ send: server.send, onfailed }
		);

		draft.edit({ content: doc('b') });
		await vi.advanceTimersByTimeAsync(1500);
		await server.answer({ kind: 'failed', message: 'Too large' });
		expect(draft.status).toBe('failed');
		expect(onfailed).toHaveBeenCalledWith('Too large');

		draft.edit({ content: doc('c') });
		await vi.advanceTimersByTimeAsync(1500);
		expect(server.requests[1]).toMatchObject({ content: doc('c'), version: 3 });
	});

	it('adopts a newer server state only when nothing local would be lost', async () => {
		const server = fakeServer();
		const draft = existing(server.send);
		const newer = { id: 'n1', title: 'Restored', content: doc('old'), version: 4 };

		expect(draft.adopt({ ...newer, version: 3 })).toBe(false);
		expect(draft.adopt({ ...newer, id: 'other' })).toBe(false);

		draft.edit({ content: doc('typing') });
		expect(draft.adopt(newer)).toBe(false);
		await vi.advanceTimersByTimeAsync(1500);
		await server.answer({ kind: 'saved', id: 'n1', version: 4 });

		expect(draft.adopt({ ...newer, version: 5 })).toBe(true);
		expect(draft).toMatchObject({ title: 'Restored', version: 5, status: 'saved' });
	});
});
