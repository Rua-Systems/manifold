<script lang="ts">
	import FilesPage from '$lib/modules/files/components/FilesPage.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<FilesPage
	view={data.view}
	filter={data.filter}
	sort={data.sort}
	folders={data.folders}
	uploadMaxBytes={data.uploadMaxBytes}
	{form}
/>
