<script lang="ts">
	import { page } from '$app/state';
	import { pageTitle } from '$lib/utils/title';
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		metaDescription: string;
		sigil?: string;
		description?: string;
		actions?: Snippet;
		/** Fills the content area edge to edge, for pages such as the map; the header is only read out. */
		fill?: boolean;
		children: Snippet;
	}

	let {
		title,
		metaDescription,
		sigil = '',
		description = '',
		actions,
		fill = false,
		children
	}: Props = $props();
</script>

<svelte:head>
	<title>{pageTitle(page.data.organizationName, title)}</title>
	<meta name="description" content={metaDescription} />
</svelte:head>

<section class="page" class:fill>
	<header class="head" class:visually-hidden={fill}>
		<div class="titles">
			{#if sigil}
				<p class="sigil">++ {sigil} ++</p>
			{/if}
			<h1>{title}</h1>
			{#if description}
				<p class="description">{description}</p>
			{/if}
		</div>
		{#if actions}
			<div class="actions">
				{@render actions()}
			</div>
		{/if}
	</header>
	<div class="body">
		{@render children()}
	</div>
</section>

<style lang="scss">
	@use '../../../styles/colors' as clr;
	@use '../../../styles/variables' as vars;

	@keyframes pageIn {
		from {
			opacity: 0;
			transform: translateY(12px);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}

	.page {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: clamp(1.4rem, 3vw, 2rem);
		min-width: 0;
		width: 100%;
		max-width: 68rem;
		margin-inline: auto;
		padding: clamp(4.5rem, 10vw, 6rem) clamp(1.2rem, 4vw, 2rem) clamp(2.5rem, 6vw, 4rem);

		// The top bar already clears the account button on phones.
		@media (max-width: vars.$mobileMax) {
			padding: 1.5rem calc(1.1rem + env(safe-area-inset-right))
				calc(2.5rem + env(safe-area-inset-bottom)) calc(1.1rem + env(safe-area-inset-left));
		}
	}

	.page.fill {
		gap: 0;
		max-width: none;
		padding: 0;

		> .body {
			display: flex;
			flex-direction: column;
			min-height: 0;
			animation: none;
		}
	}

	.head {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 1.5rem;
		flex-wrap: wrap;
		padding-bottom: clamp(1rem, 2.5vw, 1.4rem);
		border-bottom: 1px solid clr.$borderSubtleColor;
		animation: pageIn 520ms cubic-bezier(0.22, 1, 0.36, 1) both;

		> .titles {
			min-width: 0;

			> .sigil {
				font-size: 0.64rem;
				letter-spacing: 0.28em;
				text-transform: uppercase;
				color: clr.$accentMutedColor;
			}

			> h1 {
				margin-top: 0.7rem;
				font-size: clamp(1.6rem, 3.4vw, 2.2rem);
				line-height: 1.1;
			}

			> .description {
				margin-top: 0.6rem;
				max-width: 52ch;
				font-size: 0.86rem;
				color: clr.$textSecondaryColor;
			}
		}

		> .actions {
			display: flex;
			align-items: center;
			gap: 0.7rem;
			flex-wrap: wrap;
		}
	}

	.body {
		flex: 1;
		animation: pageIn 520ms cubic-bezier(0.22, 1, 0.36, 1) both;
		animation-delay: 70ms;
	}
</style>
