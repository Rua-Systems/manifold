<script lang="ts">
	import FilePreviewPage from '$lib/modules/files/components/FilePreviewPage.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

{#key data.file.id}
	<FilePreviewPage file={data.file} folders={data.folders} back={data.back} {form} />
{/key}
