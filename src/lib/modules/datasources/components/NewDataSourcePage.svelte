<script lang="ts">
	import PageShell from '$lib/components/PageShell/PageShell.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import type { FieldErrors } from '$lib/types/validation';
	import { localizedHref } from '$lib/utils/navigation';
	import { TYPE_HINTS, TYPE_LABELS } from '../labels';
	import { DATA_SOURCE_TYPES, type DataSourceType } from '../types';
	import DataSourceForm from './DataSourceForm.svelte';
	import TypeIcon from './TypeIcon.svelte';

	interface Props {
		type: DataSourceType;
		serverErrors: FieldErrors;
	}

	let { type, serverErrors }: Props = $props();
</script>

<PageShell
	title={m.datasources_new()}
	sigil={m.datasources_sigil()}
	metaDescription={m.datasources_meta_description()}
>
	{#snippet actions()}
		<a class="quiet-link" href={localizedHref('/data-sources')}>{m.datasources_all()}</a>
	{/snippet}
	<nav class="types" aria-label={m.datasources_type()}>
		{#each DATA_SOURCE_TYPES as option (option)}
			<a
				class="type"
				class:active={option === type}
				href={localizedHref(`/data-sources/new?type=${option}`)}
				aria-current={option === type ? 'page' : undefined}
				data-sveltekit-replacestate
				data-sveltekit-noscroll
			>
				<span class="box" aria-hidden="true"><TypeIcon type={option} /></span>
				<span class="text">
					<span class="name">{TYPE_LABELS[option]()}</span>
					<span class="hint">{TYPE_HINTS[option]()}</span>
				</span>
			</a>
		{/each}
	</nav>
	{#key type}
		<DataSourceForm {type} source={null} {serverErrors} />
	{/key}
</PageShell>

<style lang="scss">
	@use '../../../../styles/colors' as clr;
	@use '../../../../styles/forms' as forms;
	@use '../../../../styles/variables' as vars;

	.quiet-link {
		@include forms.mutedLink;
	}

	.types {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
		gap: 0.5rem;
		margin-bottom: 1.6rem;
	}

	.type {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-width: 0;
		padding: 0.6rem 0.7rem;
		color: inherit;
		text-decoration: none;
		background-color: clr.$surfaceColor;
		border: 1px solid clr.$borderSubtleColor;
		border-radius: vars.$radius;
		transition:
			border-color 160ms ease,
			background-color 160ms ease;

		&:hover {
			border-color: clr.$accentMutedColor;
		}

		&.active {
			border-color: clr.$accentColor;
			background-color: clr.$accentWashColor;
		}

		> .box {
			display: inline-grid;
			flex: none;
			place-items: center;
			width: 2.2rem;
			height: 2.2rem;
			color: clr.$accentColor;
		}

		> .text {
			display: flex;
			flex-direction: column;
			gap: 0.1rem;
			min-width: 0;

			> .name {
				font-size: 0.84rem;
				color: clr.$textPrimaryColor;
			}

			> .hint {
				font-size: 0.7rem;
				color: clr.$textMutedColor;
			}
		}
	}
</style>
