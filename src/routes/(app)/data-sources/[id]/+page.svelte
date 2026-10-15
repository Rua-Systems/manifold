<script lang="ts">
	import DataSourcePage from '$lib/modules/datasources/components/DataSourcePage.svelte';
	import type { FieldErrors } from '$lib/types/validation';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const serverErrors = $derived.by((): FieldErrors => {
		if (form !== null && form !== undefined && 'errors' in form && form.action === 'update') {
			return form.errors;
		}
		return {};
	});
</script>

{#key data.source.id}
	<DataSourcePage source={data.source} {serverErrors} />
{/key}
