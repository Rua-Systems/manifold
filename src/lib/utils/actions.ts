import { deserialize } from '$app/forms';
import type { ActionResult } from '@sveltejs/kit';

/**
 * Calls a form action from code, the way `use:enhance` does, for pages whose widgets save on
 * their own (the note editor, the map). Throws when the network fails.
 */
export async function postAction(
	url: string,
	fields: Record<string, string | Blob>
): Promise<ActionResult> {
	const body = new FormData();
	for (const [name, value] of Object.entries(fields)) {
		body.set(name, value);
	}
	const response = await fetch(url, {
		method: 'POST',
		body,
		headers: { 'x-sveltekit-action': 'true' }
	});
	return deserialize(await response.text());
}

/** The message a failed action answered with: its `message`, else its first field error. */
export function actionMessage(result: ActionResult, fallback: string): string {
	if (result.type !== 'failure') {
		return fallback;
	}
	const data = result.data ?? {};
	if (typeof data.message === 'string' && data.message.length > 0) {
		return data.message;
	}
	const errors = data.errors;
	if (typeof errors === 'object' && errors !== null) {
		const first = Object.values(errors).find((value) => typeof value === 'string');
		if (typeof first === 'string') {
			return first;
		}
	}
	return fallback;
}
