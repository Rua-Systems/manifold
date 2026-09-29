<script lang="ts">
	import { page } from '$app/state';
	import Credit from '$lib/components/Credit/Credit.svelte';
	import ManifoldLogo from '$lib/components/ManifoldLogo/ManifoldLogo.svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();
</script>

<div class="auth">
	<div class="visual">
		<enhanced:img
			class="backdrop"
			src="$lib/assets/images/login-bg.jpg"
			alt=""
			sizes="(max-width: 860px) 100vw, 55vw"
			fetchpriority="high"
		/>
	</div>
	<div class="panel">
		<div class="head">
			<p class="brand">
				<span class="mark" aria-hidden="true">
					<ManifoldLogo />
				</span>
				<span class="organization">{page.data.organizationName}</span>
			</p>
		</div>
		<div class="body">
			<div class="frame">
				{@render children()}
			</div>
		</div>
		<div class="foot">
			<Credit />
		</div>
	</div>
</div>

<style lang="scss">
	@use '../../../styles/colors' as clr;

	@keyframes riseIn {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}

	@keyframes settleIn {
		from {
			opacity: 0;
			transform: scale(1.06);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}

	@keyframes markIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.auth {
		width: 100%;
		min-height: 100dvh;

		display: grid;
		grid-template-columns: 1.1fr 1fr;
	}

	.visual {
		position: relative;
		overflow: hidden;
		background-color: clr.$surfaceColor;

		.backdrop {
			position: absolute;
			inset: 0;
			width: 100%;
			height: 100%;
			object-fit: cover;
			object-position: center;
			animation: settleIn 1100ms cubic-bezier(0.22, 1, 0.36, 1) both;
		}

		&::after {
			content: '';
			position: absolute;
			inset: 0;
			box-shadow: inset -80px 0 80px -50px clr.$imageEdgeColor;
			background: linear-gradient(to top, clr.$scrimColor, transparent 55%);
		}
	}

	.panel {
		display: flex;
		flex-direction: column;
		padding: clamp(1.4rem, 3.5vw, 2.6rem);

		> .head {
			display: flex;
			animation: riseIn 520ms cubic-bezier(0.22, 1, 0.36, 1) both;

			> .brand {
				display: flex;
				align-items: center;
				gap: 0.7rem;
				min-width: 0;
				padding-right: 3.5rem;

				> .mark {
					flex: none;
					width: 1.6rem;
					aspect-ratio: 500 / 434.9;
					color: clr.$textPrimaryColor;
				}

				> .organization {
					min-width: 0;
					overflow: hidden;
					font-size: 0.72rem;
					font-weight: 700;
					letter-spacing: 0.2em;
					text-transform: uppercase;
					text-overflow: ellipsis;
					white-space: nowrap;
					color: clr.$textPrimaryColor;
				}
			}
		}

		> .body {
			flex: 1;
			display: flex;
			flex-direction: column;
			justify-content: center;
			width: 100%;
			max-width: 23rem;
			margin-inline: auto;
		}

		> .foot {
			display: flex;
			justify-content: center;
			animation: riseIn 520ms cubic-bezier(0.22, 1, 0.36, 1) both;
			animation-delay: 620ms;
		}
	}

	.frame {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 1.15rem;
		padding-block: 1.5rem;

		&::before,
		&::after {
			content: '';
			position: absolute;
			width: 0.9rem;
			height: 0.9rem;
			border-color: clr.$accentMutedColor;
			border-style: solid;
			animation: markIn 520ms ease both;
			animation-delay: 560ms;
		}

		&::before {
			top: 0;
			left: -0.9rem;
			border-width: 1px 0 0 1px;
		}

		&::after {
			bottom: 0;
			right: -0.9rem;
			border-width: 0 1px 1px 0;
		}

		> :global(*) {
			animation: riseIn 560ms cubic-bezier(0.22, 1, 0.36, 1) both;
		}

		> :global(*:nth-child(1)) {
			animation-delay: 90ms;
		}

		> :global(*:nth-child(2)) {
			animation-delay: 160ms;
		}

		> :global(*:nth-child(3)) {
			animation-delay: 230ms;
		}

		> :global(*:nth-child(4)) {
			animation-delay: 300ms;
		}

		> :global(*:nth-child(5)) {
			animation-delay: 370ms;
		}
	}

	@media (max-width: 860px) {
		.auth {
			position: relative;
			grid-template-columns: 1fr;
		}

		.visual {
			position: absolute;
			inset: 0;
			z-index: 0;

			.backdrop {
				inset: -30px;
				width: calc(100% + 60px);
				height: calc(100% + 60px);
				opacity: 0.3;
				filter: blur(10px);
			}

			&::after {
				box-shadow: none;
				background: linear-gradient(to bottom, clr.$scrimSoftColor, clr.$scrimStrongColor);
			}
		}

		.panel {
			position: relative;
			z-index: 1;
			padding-top: 4.5rem;
		}
	}
</style>
