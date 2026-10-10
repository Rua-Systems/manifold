import { deserialize } from '$app/forms';
import type { ActionResult } from '@sveltejs/kit';

/**
 * Posts one file to a form action, after the other fields so the server reads them first, and
 * reports how much of it was sent. fetch cannot report the progress of an upload, so this uses
 * XMLHttpRequest. Rejects when the answer is not an action result, such as a proxy's error page.
 */
export function sendFile(
	url: string,
	fields: Record<string, string>,
	file: File,
	onprogress: (fraction: number) => void
): Promise<ActionResult> {
	return new Promise((resolve, reject) => {
		const body = new FormData();
		for (const [name, value] of Object.entries(fields)) {
			body.set(name, value);
		}
		body.set('file', file);

		const request = new XMLHttpRequest();
		request.open('POST', url);
		request.setRequestHeader('x-sveltekit-action', 'true');
		request.upload.onprogress = (event) => {
			if (event.lengthComputable) {
				onprogress(event.loaded / event.total);
			}
		};
		request.onload = () => {
			try {
				resolve(deserialize(request.responseText));
			} catch {
				reject(new Error('The answer was not an action result.'));
			}
		};
		request.onerror = () => reject(new Error('The upload failed.'));
		request.onabort = () => reject(new Error('The upload was cancelled.'));
		request.send(body);
	});
}
