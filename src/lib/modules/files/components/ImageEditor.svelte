<script lang="ts">
	import { goto } from '$app/navigation';
	import { m } from '$lib/paraglide/messages.js';
	import { getNotifications } from '$lib/state/notifications.svelte';
	import { actionMessage } from '$lib/utils/actions';
	import {
		adjustPixels,
		cropBetween,
		cropPixels,
		editedName,
		exportType,
		FULL_CROP,
		hasAdjustments,
		NO_ADJUSTMENTS,
		orientedSize,
		turn,
		type Adjustments,
		type CropRect,
		type ImageFilter,
		type Rotation
	} from '$lib/utils/image-edit';
	import { localizedHref } from '$lib/utils/navigation';
	import CropIcon from '@lucide/svelte/icons/crop';
	import FlipHorizontalIcon from '@lucide/svelte/icons/flip-horizontal';
	import FlipVerticalIcon from '@lucide/svelte/icons/flip-vertical';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import RotateCwIcon from '@lucide/svelte/icons/rotate-cw';
	import { onMount } from 'svelte';
	import { sendFile } from '../uploads';

	interface Props {
		file: { id: string; name: string; mimeType: string };
		onclose: () => void;
	}

	let { file, onclose }: Props = $props();

	/** The preview is drawn smaller; the saved copy keeps every pixel. */
	const PREVIEW_SIDE = 1200;
	/** How JPEG and WebP copies are compressed. */
	const QUALITY = 0.92;

	const FILTERS: { id: ImageFilter; label: () => string }[] = [
		{ id: 'none', label: m.files_filter_none },
		{ id: 'grayscale', label: m.files_filter_grayscale },
		{ id: 'sepia', label: m.files_filter_sepia }
	];

	const notifications = getNotifications();

	let image = $state<HTMLImageElement | null>(null);
	let failed = $state(false);
	let canvas: HTMLCanvasElement | undefined = $state();
	let rotation = $state<Rotation>(0);
	let flipX = $state(false);
	let flipY = $state(false);
	// Raw: a crop is replaced whole, and comparing it with FULL_CROP must see the same object.
	let crop = $state.raw<CropRect>(FULL_CROP);
	let adjustments = $state<Adjustments>({ ...NO_ADJUSTMENTS });
	let cropping = $state(false);
	let selection = $state.raw<CropRect | null>(null);
	let dragStart: { x: number; y: number } | null = null;
	let saving = $state(false);

	const changed = $derived(
		rotation !== 0 || flipX || flipY || crop !== FULL_CROP || hasAdjustments(adjustments)
	);

	onMount(() => {
		const loading = new Image();
		loading.decoding = 'async';
		loading.src = `/files/${file.id}`;
		loading
			.decode()
			.then(() => {
				image = loading;
			})
			.catch(() => {
				failed = true;
			});
	});

	/** Draws the turned, flipped and cropped image with its colours, at most `maxSide` wide. */
	function render(target: HTMLCanvasElement, area: CropRect, maxSide: number | null): void {
		if (image === null) {
			return;
		}
		const sourceWidth = image.naturalWidth;
		const sourceHeight = image.naturalHeight;
		const oriented = orientedSize(sourceWidth, sourceHeight, rotation);
		const pixels = cropPixels(area, oriented.width, oriented.height);
		let scale = 1;
		if (maxSide !== null) {
			scale = Math.min(1, maxSide / Math.max(pixels.width, pixels.height));
		}
		target.width = Math.max(1, Math.round(pixels.width * scale));
		target.height = Math.max(1, Math.round(pixels.height * scale));
		const context = target.getContext('2d');
		if (context === null) {
			return;
		}

		let flipWidth = 1;
		if (flipX) {
			flipWidth = -1;
		}
		let flipHeight = 1;
		if (flipY) {
			flipHeight = -1;
		}
		// Applied to the image from the last call back: turn, flip, centre, crop, then scale.
		context.save();
		context.scale(scale, scale);
		context.translate(-pixels.x, -pixels.y);
		context.translate(oriented.width / 2, oriented.height / 2);
		context.scale(flipWidth, flipHeight);
		context.rotate((rotation * Math.PI) / 180);
		context.drawImage(image, -sourceWidth / 2, -sourceHeight / 2);
		context.restore();

		if (hasAdjustments(adjustments)) {
			const data = context.getImageData(0, 0, target.width, target.height);
			adjustPixels(data.data, adjustments);
			context.putImageData(data, 0, 0);
		}
	}

	// Redraws the preview whenever a setting changes; while cropping it shows the whole image.
	$effect(() => {
		if (canvas === undefined || image === null) {
			return;
		}
		let area = crop;
		if (cropping) {
			area = FULL_CROP;
		}
		render(canvas, area, PREVIEW_SIDE);
	});

	function pointOf(event: PointerEvent): { x: number; y: number } {
		const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
		return {
			x: (event.clientX - box.left) / box.width,
			y: (event.clientY - box.top) / box.height
		};
	}

	function startSelection(event: PointerEvent): void {
		if (!cropping) {
			return;
		}
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		dragStart = pointOf(event);
		selection = null;
	}

	function moveSelection(event: PointerEvent): void {
		if (dragStart !== null) {
			selection = cropBetween(dragStart, pointOf(event));
		}
	}

	function endSelection(): void {
		dragStart = null;
	}

	/** The selection was drawn on the whole image; the crop is kept in that same frame. */
	function applyCrop(): void {
		if (selection !== null) {
			crop = selection;
		}
		cropping = false;
		selection = null;
	}

	function rotateBy(direction: 1 | -1): void {
		rotation = turn(rotation, direction);
		// A crop belongs to one orientation; turning starts over from the whole image.
		crop = FULL_CROP;
	}

	function flip(horizontal: boolean): void {
		if (horizontal) {
			flipX = !flipX;
		} else {
			flipY = !flipY;
		}
		crop = FULL_CROP;
	}

	function resetAll(): void {
		rotation = 0;
		flipX = false;
		flipY = false;
		crop = FULL_CROP;
		adjustments = { ...NO_ADJUSTMENTS };
		cropping = false;
		selection = null;
	}

	function toBlob(target: HTMLCanvasElement, type: string): Promise<Blob | null> {
		return new Promise((resolve) => target.toBlob(resolve, type, QUALITY));
	}

	async function save(): Promise<void> {
		saving = true;
		try {
			const output = document.createElement('canvas');
			render(output, crop, null);
			const type = exportType(file.mimeType);
			const blob = await toBlob(output, type);
			if (blob === null) {
				notifications.fault(m.files_edit_failed());
				return;
			}
			const copy = new File([blob], editedName(file.name, m.files_edited_suffix(), type), {
				type
			});
			const result = await sendFile('?/saveEdited', { id: file.id }, copy, () => {});
			if (result.type === 'success' && typeof result.data?.id === 'string') {
				notifications.confirm(m.files_edited_saved());
				await goto(localizedHref(`/files/view/${result.data.id}`));
				return;
			}
			notifications.fault(actionMessage(result, m.files_edit_failed()));
		} catch {
			notifications.fault(m.files_edit_failed());
		} finally {
			saving = false;
		}
	}
</script>

<div class="image-editor">
	<div class="stage">
		{#if failed}
			<p class="state" role="alert">{m.files_preview_failed()}</p>
		{:else if image === null}
			<p class="state">{m.files_preview_loading()}</p>
		{/if}
		<div
			class="canvas"
			class:cropping
			role="application"
			aria-label={m.files_crop_area()}
			onpointerdown={startSelection}
			onpointermove={moveSelection}
			onpointerup={endSelection}
			onpointercancel={endSelection}
		>
			<canvas bind:this={canvas} aria-hidden="true"></canvas>
			{#if cropping && selection !== null}
				<span
					class="selection"
					style:left="{selection.x * 100}%"
					style:top="{selection.y * 100}%"
					style:width="{selection.width * 100}%"
					style:height="{selection.height * 100}%"
				></span>
			{/if}
		</div>
		{#if cropping}
			<p class="hint">{m.files_crop_hint()}</p>
		{/if}
	</div>
	<div class="controls">
		<fieldset>
			<legend>{m.files_edit_turn()}</legend>
			<div class="row">
				<button
					type="button"
					class="tool"
					aria-label={m.files_rotate_left()}
					title={m.files_rotate_left()}
					onclick={() => rotateBy(-1)}
				>
					<RotateCcwIcon size={17} />
				</button>
				<button
					type="button"
					class="tool"
					aria-label={m.files_rotate_right()}
					title={m.files_rotate_right()}
					onclick={() => rotateBy(1)}
				>
					<RotateCwIcon size={17} />
				</button>
				<button
					type="button"
					class="tool"
					class:active={flipX}
					aria-pressed={flipX}
					aria-label={m.files_flip_horizontal()}
					title={m.files_flip_horizontal()}
					onclick={() => flip(true)}
				>
					<FlipHorizontalIcon size={17} />
				</button>
				<button
					type="button"
					class="tool"
					class:active={flipY}
					aria-pressed={flipY}
					aria-label={m.files_flip_vertical()}
					title={m.files_flip_vertical()}
					onclick={() => flip(false)}
				>
					<FlipVerticalIcon size={17} />
				</button>
			</div>
		</fieldset>
		<fieldset>
			<legend>{m.files_crop()}</legend>
			<div class="row">
				{#if cropping}
					<button
						type="button"
						class="quiet"
						disabled={selection === null}
						onclick={applyCrop}
					>
						{m.files_crop_apply()}
					</button>
					<button
						type="button"
						class="quiet"
						onclick={() => {
							cropping = false;
							selection = null;
						}}
					>
						{m.common_cancel()}
					</button>
				{:else}
					<button type="button" class="quiet" onclick={() => (cropping = true)}>
						<CropIcon size={15} />
						{m.files_crop()}
					</button>
					<button
						type="button"
						class="quiet"
						disabled={crop === FULL_CROP}
						onclick={() => (crop = FULL_CROP)}
					>
						{m.files_crop_reset()}
					</button>
				{/if}
			</div>
		</fieldset>
		<fieldset>
			<legend>{m.files_colours()}</legend>
			<label class="slider">
				<span>{m.files_brightness()} <output>{adjustments.brightness}</output></span>
				<input type="range" min="-100" max="100" bind:value={adjustments.brightness} />
			</label>
			<label class="slider">
				<span>{m.files_contrast()} <output>{adjustments.contrast}</output></span>
				<input type="range" min="-100" max="100" bind:value={adjustments.contrast} />
			</label>
			<label class="slider">
				<span>{m.files_saturation()} <output>{adjustments.saturation}</output></span>
				<input type="range" min="-100" max="100" bind:value={adjustments.saturation} />
			</label>
			<div class="filters" role="radiogroup" aria-label={m.files_filter_label()}>
				{#each FILTERS as filter (filter.id)}
					<label class:active={adjustments.filter === filter.id}>
						<input
							type="radio"
							name="imageFilter"
							value={filter.id}
							bind:group={adjustments.filter}
						/>
						<span>{filter.label()}</span>
					</label>
				{/each}
			</div>
		</fieldset>
		<div class="actions">
			<button type="button" class="quiet" disabled={!changed || saving} onclick={resetAll}>
				{m.files_edit_reset()}
			</button>
			<button type="button" class="quiet" disabled={saving} onclick={onclose}>
				{m.common_cancel()}
			</button>
			<button
				type="button"
				class="primary"
				disabled={!changed || saving || image === null}
				aria-busy={saving}
				onclick={save}
			>
				{m.files_edit_save()}
			</button>
		</div>
		<p class="note">{m.files_edit_note()}</p>
	</div>
</div>

<style lang="scss">
	@use '../../../../styles/colors' as clr;
	@use '../../../../styles/forms' as forms;
	@use '../../../../styles/variables' as vars;

	.image-editor {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 17rem;
		align-items: start;
		gap: 1.2rem;
	}

	.stage {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		min-width: 0;

		> .state,
		> .hint {
			font-size: 0.8rem;
			color: clr.$textMutedColor;
		}
	}

	.canvas {
		position: relative;
		align-self: center;
		max-width: 100%;
		overflow: hidden;
		line-height: 0;
		touch-action: none;

		&.cropping {
			cursor: crosshair;
		}

		> canvas {
			max-width: 100%;
			max-height: 70vh;
			border: 1px solid clr.$imageEdgeColor;
			border-radius: vars.$radius;
		}

		> .selection {
			position: absolute;
			pointer-events: none;
			border: 2px dashed clr.$accentColor;
			box-shadow: 0 0 0 9999px clr.$scrimColor;
		}
	}

	.controls {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 0.9rem 1rem;
		background-color: clr.$surfaceColor;
		border: 1px solid clr.$borderSubtleColor;
		border-radius: vars.$radius;

		> fieldset {
			display: flex;
			flex-direction: column;
			gap: 0.5rem;
			min-width: 0;
			margin: 0;
			padding: 0;
			border: 0;

			> legend {
				@include forms.fieldLabel;
			}
		}

		> .note {
			font-size: 0.7rem;
			color: clr.$textMutedColor;
		}
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.tool {
		@include forms.framedToolButton;

		&.active {
			@include forms.toolButtonActive;
		}
	}

	.quiet {
		@include forms.framedButton;
		gap: 0.4rem;

		&:disabled {
			opacity: 0.45;
		}
	}

	.primary {
		@include forms.primaryButton;
	}

	.slider {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		font-size: 0.76rem;
		color: clr.$textSecondaryColor;

		> span > output {
			float: right;
			font-variant-numeric: tabular-nums;
			color: clr.$textMutedColor;
		}

		> input {
			width: 100%;
			accent-color: clr.$accentColor;
		}
	}

	.filters {
		@include forms.segmentedControl;

		> label {
			@include forms.segmentedOption;
			position: relative;

			&.active {
				@include forms.segmentedOptionActive;
			}

			> input {
				position: absolute;
				opacity: 0;
				pointer-events: none;
			}
		}

		> label:focus-within {
			outline: 2px solid clr.$focusRingColor;
			outline-offset: -2px;
		}
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.5rem;
	}

	@media (max-width: vars.$mobileMax) {
		.image-editor {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
