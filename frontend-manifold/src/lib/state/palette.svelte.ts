import { getContext, setContext } from 'svelte';

const PALETTE_KEY = Symbol('palette');

/** Whether the command palette is open; the layout owns it, buttons and shortcuts open it. */
export class PaletteState {
	open = $state(false);

	show(): void {
		this.open = true;
	}
}

export function setPalette(): PaletteState {
	return setContext(PALETTE_KEY, new PaletteState());
}

export function getPalette(): PaletteState {
	return getContext<PaletteState>(PALETTE_KEY);
}
