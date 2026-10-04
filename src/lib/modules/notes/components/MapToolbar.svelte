<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import Eraser from '@lucide/svelte/icons/eraser';
	import Layers from '@lucide/svelte/icons/layers';
	import LocateFixed from '@lucide/svelte/icons/locate-fixed';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import MousePointer2 from '@lucide/svelte/icons/mouse-pointer-2';
	import Move from '@lucide/svelte/icons/move';
	import Pentagon from '@lucide/svelte/icons/pentagon';
	import Spline from '@lucide/svelte/icons/spline';
	import Undo2 from '@lucide/svelte/icons/undo-2';
	import X from '@lucide/svelte/icons/x';
	import type { Component } from 'svelte';
	import type { MapMode } from '../map/controller';

	interface Props {
		mode: MapMode;
		/** A drawing is in progress: undo and cancel apply. */
		drawing: boolean;
		onmode: (mode: MapMode) => void;
		onundo: () => void;
		oncancel: () => void;
		onlocate: () => void;
		/** Opens the choice of basemaps. */
		onbasemaps: () => void;
	}

	let { mode, drawing, onmode, onundo, oncancel, onlocate, onbasemaps }: Props = $props();

	const MODES: { mode: MapMode; label: () => string; icon: Component }[] = [
		{ mode: 'select', label: m.map_tool_select, icon: MousePointer2 },
		{ mode: 'point', label: m.map_tool_point, icon: MapPin },
		{ mode: 'line', label: m.map_tool_line, icon: Spline },
		{ mode: 'polygon', label: m.map_tool_polygon, icon: Pentagon },
		{ mode: 'modify', label: m.map_tool_modify, icon: Move },
		{ mode: 'delete', label: m.map_tool_delete, icon: Eraser }
	];
</script>

<div class="toolbar" role="toolbar" aria-label={m.map_tools()}>
	<div class="group">
		{#each MODES as tool (tool.mode)}
			{@const Icon = tool.icon}
			<button
				type="button"
				class="tool"
				class:active={mode === tool.mode}
				aria-label={tool.label()}
				aria-pressed={mode === tool.mode}
				title={tool.label()}
				onclick={() => onmode(tool.mode)}
			>
				<Icon size={18} />
			</button>
		{/each}
	</div>
	<div class="group">
		<button
			type="button"
			class="tool"
			aria-label={m.map_tool_undo()}
			title={m.map_tool_undo()}
			disabled={!drawing}
			onclick={onundo}
		>
			<Undo2 size={18} />
		</button>
		<button
			type="button"
			class="tool"
			aria-label={m.map_tool_cancel()}
			title={m.map_tool_cancel()}
			disabled={!drawing}
			onclick={oncancel}
		>
			<X size={18} />
		</button>
	</div>
	<div class="group">
		<button
			type="button"
			class="tool"
			aria-label={m.map_locate()}
			title={m.map_locate()}
			onclick={onlocate}
		>
			<LocateFixed size={18} />
		</button>
		<button
			type="button"
			class="tool"
			aria-label={m.map_basemaps_title()}
			aria-haspopup="dialog"
			title={m.map_basemaps_title()}
			onclick={onbasemaps}
		>
			<Layers size={18} />
		</button>
	</div>
</div>

<style lang="scss">
	@use '../../../../styles/colors' as clr;
	@use '../../../../styles/forms' as forms;
	@use '../../../../styles/variables' as vars;

	.toolbar {
		display: flex;
		gap: 0.3rem 0.5rem;
		padding: 0.3rem;
		background-color: clr.$panelColor;
		border: 1px solid clr.$borderSubtleColor;
		border-radius: vars.$radius;
		box-shadow: 0 8px 24px clr.$shadowColor;
		backdrop-filter: blur(10px);
	}

	.group {
		display: flex;
		gap: 0.15rem;

		&:not(:last-child) {
			padding-right: 0.5rem;
			border-right: 1px solid clr.$borderMutedColor;
		}
	}

	.tool {
		@include forms.toolButton;

		&.active {
			@include forms.toolButtonActive;
		}
	}

	// Phones: one scrolling row along the bottom edge, which the page frames.
	@media (max-width: vars.$mobileMax) {
		.toolbar {
			flex: 1;
			min-width: 0;
			overflow-x: auto;
			background-color: transparent;
			border: 0;
			border-radius: 0;
			box-shadow: none;
			scrollbar-width: none;
		}
	}
</style>
