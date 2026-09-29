<script lang="ts">
	import PageShell from '$lib/components/PageShell/PageShell.svelte';
	import SettingsNav from '$lib/components/SettingsNav/SettingsNav.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { localizedHref } from '$lib/utils/navigation';
</script>

<PageShell
	title={m.data_title()}
	sigil={m.account_sigil()}
	metaDescription={m.data_meta_description()}
>
	<SettingsNav />
	<section class="section" aria-labelledby="exportHeading">
		<h2 id="exportHeading">{m.data_export_title()}</h2>
		<p>{m.data_export_lead()}</p>
		<p class="warning">{m.data_export_key_warning()}</p>
		<!-- A file download, not a page: the browser loads it directly. -->
		<a class="primary" href={localizedHref('/settings/data/export')} data-sveltekit-reload>
			{m.data_export_download()}
		</a>
	</section>
</PageShell>

<style lang="scss">
	@use '../../../../styles/colors' as clr;
	@use '../../../../styles/forms' as forms;
	@use '../../../../styles/variables' as vars;

	.section {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		max-width: 36rem;

		> h2 {
			display: flex;
			align-items: center;
			gap: 0.9rem;
			font-size: 0.7rem;
			letter-spacing: 0.24em;
			text-transform: uppercase;
			color: clr.$accentColor;

			&::after {
				content: '';
				flex: 1;
				height: 1px;
				background-color: clr.$borderSubtleColor;
			}
		}

		> p {
			font-size: 0.86rem;
		}

		> .warning {
			padding: 0.7rem 0.9rem;
			color: clr.$textPrimaryColor;
			border: 1px solid clr.$errorColor;
			border-radius: vars.$radius;
		}

		> .primary {
			@include forms.primaryButton;
			align-self: flex-start;
			text-decoration: none;
		}
	}
</style>
