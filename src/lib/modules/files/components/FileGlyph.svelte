<script lang="ts">
	import type { FileKind } from '$lib/types/files';
	import FileIcon from '@lucide/svelte/icons/file';
	import FileImageIcon from '@lucide/svelte/icons/file-image';
	import FileMusicIcon from '@lucide/svelte/icons/file-music';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import FileVideoIcon from '@lucide/svelte/icons/file-video';

	interface Props {
		id: string;
		kind: FileKind;
		/** Images show a small picture of themselves instead of an icon. */
		thumbnail?: boolean;
	}

	let { id, kind, thumbnail = true }: Props = $props();

	const ICONS: Record<FileKind, typeof FileIcon> = {
		image: FileImageIcon,
		pdf: FileTextIcon,
		audio: FileMusicIcon,
		video: FileVideoIcon,
		text: FileTextIcon,
		other: FileIcon
	};

	const Icon = $derived(ICONS[kind]);
</script>

<span class="glyph {kind}" aria-hidden="true">
	{#if thumbnail && kind === 'image'}
		<img src="/files/{id}" alt="" loading="lazy" decoding="async" />
	{:else}
		<Icon size={20} strokeWidth={1.5} />
	{/if}
</span>

<style lang="scss">
	@use '../../../../styles/colors' as clr;
	@use '../../../../styles/variables' as vars;

	.glyph {
		display: inline-grid;
		flex: none;
		place-items: center;
		width: 2.5rem;
		height: 2.5rem;
		overflow: hidden;
		color: clr.$textSecondaryColor;
		background-color: clr.$surfaceHoverColor;
		border: 1px solid clr.$borderSubtleColor;
		border-radius: vars.$radius;

		&.pdf {
			color: clr.$accentColor;
		}

		> img {
			width: 100%;
			height: 100%;
			object-fit: cover;
		}
	}
</style>
