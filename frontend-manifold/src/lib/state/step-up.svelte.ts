import type { ActionResult } from '@sveltejs/kit';
import { getContext, setContext } from 'svelte';

const STEP_UP_KEY = Symbol('stepUp');

/**
 * The step-up dialog of the signed in pages. A form whose action answers `stepUp: true` asks for
 * it with `request()` and submits again once the owner confirmed their identity.
 */
export class StepUpState {
	open = $state(false);

	private settle: ((confirmed: boolean) => void) | null = null;

	request(): Promise<boolean> {
		this.settle?.(false);
		this.open = true;
		return new Promise((resolve) => {
			this.settle = resolve;
		});
	}

	finish(confirmed: boolean): void {
		this.open = false;
		const settle = this.settle;
		this.settle = null;
		settle?.(confirmed);
	}
}

export function setStepUp(): StepUpState {
	return setContext(STEP_UP_KEY, new StepUpState());
}

export function getStepUp(): StepUpState {
	return getContext<StepUpState>(STEP_UP_KEY);
}

/** Whether a form action refused because the step-up is missing or old. */
export function needsStepUp(result: ActionResult): boolean {
	return result.type === 'failure' && result.data?.stepUp === true;
}
