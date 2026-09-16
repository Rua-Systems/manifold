<script lang="ts">
	import logo from '$lib/assets/favicon.png';
	import { DEFAULT_TITLE } from '$lib/constants';
</script>

<svelte:head>
	<title>{DEFAULT_TITLE}</title>
</svelte:head>

<section class="hero">
	<p class="greeting">++ Welcome to the ++</p>
	<div class="mark">
		<h1 class="wordmark">manifold</h1>
		<img class="logo" src={logo} alt="" />
	</div>
	<p class="hint">To get info about the project, visit <a href="/about">about</a></p>
</section>

<style lang="scss">
	@use '../styles/colors' as clr;

	@keyframes riseIn {
		from {
			opacity: 0;
			transform: translateY(12px);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}

	@keyframes wordmarkIn {
		from {
			opacity: 0;
			letter-spacing: 0.3em;
			filter: blur(10px);
		}
		to {
			opacity: 1;
			letter-spacing: -0.02em;
			filter: blur(0);
		}
	}

	@keyframes logoIn {
		0% {
			opacity: 0;
			transform: rotateY(0deg) scale(0.65);
		}
		18% {
			opacity: 1;
		}
		100% {
			opacity: 1;
			transform: rotateY(1080deg) scale(1);
		}
	}

	.hero {
		--wordmark-size: clamp(2.6rem, 8vw, 5rem);

		display: flex;
		flex: 1;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: clamp(0.8rem, 2vw, 1.4rem);
		padding: clamp(1rem, 4vw, 2rem);
		text-align: center;

		> .greeting {
			font-size: clamp(0.66rem, 1.6vw, 0.78rem);
			letter-spacing: 0.32em;
			text-transform: uppercase;
			color: clr.$textMutedColor;
			animation: riseIn 520ms cubic-bezier(0.22, 1, 0.36, 1) both;
			animation-delay: 80ms;
		}

		> .mark {
			display: flex;
			align-items: center;
			justify-content: center;
			flex-wrap: wrap;
			gap: clamp(0.8rem, 2.5vw, 1.6rem);
			perspective: 700px;

			> .wordmark {
				font-size: var(--wordmark-size);
				line-height: 1;
				color: clr.$textPrimaryColor;
				animation: wordmarkIn 680ms cubic-bezier(0.22, 1, 0.36, 1) both;
				animation-delay: 200ms;
			}

			> .logo {
				width: var(--wordmark-size);
				height: var(--wordmark-size);
				object-fit: contain;
				animation: logoIn 1250ms cubic-bezier(0.18, 0.85, 0.3, 1) both;
				animation-delay: 700ms;
			}
		}

		> .hint {
			font-size: clamp(0.78rem, 1.8vw, 0.88rem);
			letter-spacing: 0.02em;
			color: clr.$textMutedColor;
			animation: riseIn 520ms cubic-bezier(0.22, 1, 0.36, 1) both;
			animation-delay: 1700ms;

			> a {
				color: clr.$accentColor;
				text-decoration: none;
				border-bottom: 1px solid clr.$accentMutedColor;
				transition:
					color 160ms ease,
					border-color 160ms ease;

				&:hover {
					color: clr.$textPrimaryColor;
					border-bottom-color: clr.$textPrimaryColor;
				}
			}
		}
	}
</style>
