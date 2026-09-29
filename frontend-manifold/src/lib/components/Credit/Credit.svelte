<script lang="ts">
	import ManifoldLogo from '$lib/components/ManifoldLogo/ManifoldLogo.svelte';
	import {
		AUTHOR_NAME,
		AUTHOR_URL,
		DEVELOPER_NAME,
		DEVELOPER_URL,
		PRODUCT_NAME
	} from '$lib/constants';
	import { m } from '$lib/paraglide/messages.js';
</script>

<p class="credit">
	<span class="mark" aria-hidden="true">
		<ManifoldLogo />
	</span>
	<span class="text">
		{PRODUCT_NAME}{m.credit_after_product()}
		<a href={DEVELOPER_URL} target="_blank" rel="external noopener noreferrer"
			>{DEVELOPER_NAME}</a
		>
		{m.credit_between()}
		<a href={AUTHOR_URL} target="_blank" rel="external noopener noreferrer">{AUTHOR_NAME}</a
		>{m.credit_after_author()}
	</span>
</p>

<style lang="scss">
	@use '../../../styles/colors' as clr;

	.credit {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-size: 0.66rem;
		line-height: 1.5;
		letter-spacing: 0.08em;
		color: clr.$textMutedColor;

		> .mark {
			flex: none;
			width: 1.1rem;
			aspect-ratio: 500 / 434.9;
			color: clr.$textSecondaryColor;
		}

		> .text > a {
			color: clr.$textSecondaryColor;
			text-decoration: none;
			border-bottom: 1px solid clr.$accentMutedColor;
			transition:
				color 160ms ease,
				border-color 160ms ease;

			&:hover {
				color: clr.$accentColor;
				border-bottom-color: clr.$accentColor;
			}
		}
	}
</style>
