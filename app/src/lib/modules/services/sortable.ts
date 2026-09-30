import type { Action } from 'svelte/action';

export interface SortableOptions {
	ids: string[];
	/** The order while dragging, or null when the drag was abandoned. */
	onpreview: (order: string[] | null) => void;
	oncommit: (order: string[]) => void;
}

function itemId(target: EventTarget | null): string | null {
	if (!(target instanceof Element)) {
		return null;
	}
	const item = target.closest<HTMLElement>('[data-sortable-id]');
	return item?.dataset.sortableId ?? null;
}

/**
 * Mouse drag and drop ordering for the items inside `node` that carry `data-sortable-id`.
 * Touch and keyboard users reorder with the move buttons instead.
 */
export const sortable: Action<HTMLElement, SortableOptions> = (node, initial) => {
	let options = initial;
	let dragged: string | null = null;
	let order: string[] = [];

	function onDragStart(event: DragEvent): void {
		const id = itemId(event.target);
		if (id === null || event.dataTransfer === null) {
			return;
		}
		dragged = id;
		order = [...options.ids];
		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('text/plain', id);
	}

	function onDragOver(event: DragEvent): void {
		if (dragged === null) {
			return;
		}
		event.preventDefault();

		const over = itemId(event.target);
		if (over === null || over === dragged) {
			return;
		}
		const from = order.indexOf(dragged);
		const to = order.indexOf(over);
		order.splice(from, 1);
		order.splice(to, 0, dragged);
		options.onpreview([...order]);
	}

	function onDrop(event: DragEvent): void {
		if (dragged === null) {
			return;
		}
		event.preventDefault();
		dragged = null;
		options.oncommit([...order]);
	}

	function onDragEnd(): void {
		if (dragged !== null) {
			dragged = null;
			options.onpreview(null);
		}
	}

	node.addEventListener('dragstart', onDragStart);
	node.addEventListener('dragover', onDragOver);
	node.addEventListener('drop', onDrop);
	node.addEventListener('dragend', onDragEnd);

	return {
		update(next: SortableOptions): void {
			options = next;
		},
		destroy(): void {
			node.removeEventListener('dragstart', onDragStart);
			node.removeEventListener('dragover', onDragOver);
			node.removeEventListener('drop', onDrop);
			node.removeEventListener('dragend', onDragEnd);
		}
	};
};
