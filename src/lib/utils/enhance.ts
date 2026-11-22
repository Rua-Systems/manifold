import { enhance as kitEnhance, type SubmitFunction } from '$app/forms';

type ActionData = Record<string, unknown> | undefined;

/**
 * `use:enhance` that applies an action's answer to the page it was sent from, as SvelteKit 2 did.
 * SvelteKit 3 moves to the page an action answers for whenever that differs from the current
 * address, and the action of `/notes?folder=<id>` answers for `/notes`, so every form would close
 * the open folder, filter or revision. Redirects are still followed.
 */
export function enhance<Success extends ActionData, Failure extends ActionData>(
	form: HTMLFormElement,
	submit?: SubmitFunction<Success, Failure>
): { destroy(): void } {
	return kitEnhance<Success, Failure>(form, async (input) => {
		let callback: Awaited<ReturnType<SubmitFunction<Success, Failure>>>;
		if (submit !== undefined) {
			callback = await submit(input);
		}
		return async (opts) => {
			const update: typeof opts.update = (options) =>
				opts.update({ navigate: false, ...options });
			if (typeof callback === 'function') {
				await callback({ ...opts, update });
				return;
			}
			await update();
		};
	});
}
