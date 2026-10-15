<script lang="ts">
	import CloudIcon from '@lucide/svelte/icons/cloud';
	import DatabaseIcon from '@lucide/svelte/icons/database';
	import LayersIcon from '@lucide/svelte/icons/layers';
	import LinkIcon from '@lucide/svelte/icons/link';
	import PlugIcon from '@lucide/svelte/icons/plug';
	import type { DataSourceType } from '../types';

	interface Props {
		type: DataSourceType;
		size?: number;
	}

	let { type, size = 20 }: Props = $props();

	const ICONS = {
		postgresql: DatabaseIcon,
		mysql: DatabaseIcon,
		redis: LayersIcon,
		s3: CloudIcon,
		api: PlugIcon,
		link: LinkIcon
	};

	const Icon = $derived(ICONS[type]);
</script>

<Icon {size} strokeWidth={1.5} aria-hidden="true" />
