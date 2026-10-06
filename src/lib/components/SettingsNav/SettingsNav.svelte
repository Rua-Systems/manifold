<script lang="ts">
	import { page } from '$app/state';
	import { m } from '$lib/paraglide/messages.js';
	import { currentMarker, localizedHref } from '$lib/utils/navigation';

	const LINKS = [
		{ path: '/settings', label: m.settings_section_profile },
		{ path: '/settings/security', label: m.settings_section_security },
		{ path: '/settings/api-keys', label: m.settings_section_api_keys },
		{ path: '/settings/map', label: m.settings_section_map },
		{ path: '/settings/usage', label: m.settings_section_usage },
		{ path: '/settings/data', label: m.settings_section_data }
	] as const;
</script>

<nav class="sections" aria-label={m.settings_sections_label()}>
	{#each LINKS as link (link.path)}
		<a href={localizedHref(link.path)} aria-current={currentMarker(page.url, link.path)}>
			{link.label()}
		</a>
	{/each}
	<a href="{localizedHref('/settings')}#about">{m.settings_section_about()}</a>
</nav>

<style lang="scss">
	@use '../../../styles/colors' as clr;
	@use '../../../styles/forms' as forms;

	.sections {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem 1.2rem;
		margin-bottom: 1.5rem;

		> a {
			@include forms.mutedLink;

			&[aria-current='page'] {
				color: clr.$accentColor;
			}
		}
	}
</style>
