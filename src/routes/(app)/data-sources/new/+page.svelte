<script lang="ts">
	import NewDataSourcePage from '#lib/modules/datasources/components/NewDataSourcePage.svelte';
	import type { FieldErrors } from '#lib/types/validation.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const serverErrors = $derived((form?.errors ?? {}) as FieldErrors);
</script>

<NewDataSourcePage type={data.type} {serverErrors} />
