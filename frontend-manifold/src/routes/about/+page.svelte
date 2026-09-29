<script lang="ts">
	import YouTubeEmbed from '$lib/components/YouTubeEmbed/YouTubeEmbed.svelte';
	import { APP_NAME, SITE_NAME, SITE_URL, pageTitle } from '$lib/constants';
	import { m } from '$lib/paraglide/messages.js';
</script>

<svelte:head>
	<title>{pageTitle(m.about_title())}</title>
	<meta name="description" content={m.about_meta_description()} />
</svelte:head>

<section class="about">
	<div class="inner">
		<header class="intro">
			<p class="sigil">++ {m.about_sigil()} ++</p>
			<h1>{m.about_title()}</h1>
			<p class="lead">{m.about_lead({ app: APP_NAME })}</p>
		</header>
		<article class="block">
			<h2>{m.about_what_title()}</h2>
			<p>{m.about_what_body()}</p>
			<figure>
				<enhanced:img
					class="image"
					src="$lib/assets/images/login-bg.jpg"
					alt=""
					sizes="(max-width: 704px) 100vw, 704px"
					loading="lazy"
				/>
				<figcaption>{m.about_figure_image_one()}</figcaption>
			</figure>
		</article>
		<article class="block">
			<h2>{m.about_why_title()}</h2>
			<p>{m.about_why_body()}</p>
			<figure>
				<enhanced:img
					class="image"
					src="$lib/assets/images/login-bg.jpg"
					alt=""
					sizes="(max-width: 704px) 100vw, 704px"
					loading="lazy"
				/>
				<figcaption>{m.about_figure_image_two()}</figcaption>
			</figure>
		</article>
		<article class="block">
			<h2>{m.about_walkthrough_title()}</h2>
			<p>{m.about_walkthrough_body()}</p>
			<figure>
				<YouTubeEmbed id="ztzq05IzYds" title={m.about_video_title()} />
				<figcaption>{m.about_figure_video()}</figcaption>
			</figure>
		</article>
		<article class="block">
			<h2>{m.about_status_title()}</h2>
			<p>{m.about_status_body()}</p>
		</article>
		<dl class="record">
			<div class="row">
				<dt>{m.about_designation_label()}</dt>
				<dd>{APP_NAME}</dd>
			</div>
			<div class="row">
				<dt>{m.about_status_label()}</dt>
				<dd>{m.about_status_value()}</dd>
			</div>
			<div class="row">
				<dt>{m.about_access_label()}</dt>
				<dd>{m.about_access_value()}</dd>
			</div>
			<div class="row">
				<dt>{m.about_maintainer_label()}</dt>
				<dd>
					<a href={SITE_URL} target="_blank" rel="external noreferrer">{SITE_NAME}</a>
				</dd>
			</div>
		</dl>
	</div>
</section>

<style lang="scss">
	@use '../../styles/colors' as clr;
	@use '../../styles/variables' as vars;

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

	@keyframes markIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.about {
		display: flex;
		flex: 1;
		justify-content: center;
		padding: clamp(4.5rem, 10vw, 6.5rem) clamp(1.2rem, 4vw, 2rem) clamp(3rem, 8vw, 5rem);
	}

	.inner {
		display: flex;
		flex-direction: column;
		gap: clamp(2rem, 5vw, 3rem);
		width: 100%;
		max-width: 44rem;

		> * {
			animation: riseIn 560ms cubic-bezier(0.22, 1, 0.36, 1) both;
		}

		> *:nth-child(1) {
			animation-delay: 80ms;
		}

		> *:nth-child(2) {
			animation-delay: 160ms;
		}

		> *:nth-child(3) {
			animation-delay: 240ms;
		}

		> *:nth-child(4) {
			animation-delay: 320ms;
		}

		> *:nth-child(5) {
			animation-delay: 400ms;
		}

		> *:nth-child(6) {
			animation-delay: 480ms;
		}

		> *:nth-child(7) {
			animation-delay: 560ms;
		}

		> *:nth-child(8) {
			animation-delay: 640ms;
		}
	}

	.intro {
		> .sigil {
			font-size: 0.66rem;
			letter-spacing: 0.3em;
			text-transform: uppercase;
			color: clr.$accentMutedColor;
		}

		> h1 {
			margin-top: 0.9rem;
			font-size: clamp(2rem, 5vw, 2.8rem);
			line-height: 1.1;
		}

		> .lead {
			margin-top: 1rem;
			font-size: 0.95rem;
			color: clr.$textSecondaryColor;
		}
	}

	.block {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;

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
			font-size: 0.92rem;
			color: clr.$textSecondaryColor;
		}

		> figure {
			margin: 0.4rem 0 0;

			.image {
				display: block;
				width: 100%;
				height: auto;
				aspect-ratio: 16 / 9;
				object-fit: cover;
				background-color: clr.$surfaceColor;
				border: 1px solid clr.$borderSubtleColor;
				border-radius: vars.$radius;
			}

			> figcaption {
				margin-top: 0.7rem;
				font-size: 0.64rem;
				letter-spacing: 0.2em;
				text-transform: uppercase;
				color: clr.$textMutedColor;
			}
		}
	}

	.record {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		margin: 0;
		padding: 1.4rem 1.5rem;

		&::before,
		&::after {
			content: '';
			position: absolute;
			width: 0.9rem;
			height: 0.9rem;
			border-color: clr.$accentMutedColor;
			border-style: solid;
			animation: markIn 520ms ease both;
			animation-delay: 760ms;
		}

		&::before {
			top: 0;
			left: 0;
			border-width: 1px 0 0 1px;
		}

		&::after {
			bottom: 0;
			right: 0;
			border-width: 0 1px 1px 0;
		}

		> .row {
			display: grid;
			grid-template-columns: 9rem 1fr;
			gap: 0.6rem 1rem;

			> dt {
				font-size: 0.68rem;
				letter-spacing: 0.18em;
				text-transform: uppercase;
				color: clr.$textMutedColor;
			}

			> dd {
				margin: 0;
				font-size: 0.82rem;
				color: clr.$textSecondaryColor;

				> a {
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
		}
	}

	@media (max-width: 520px) {
		.record > .row {
			grid-template-columns: 1fr;
			gap: 0.2rem;
		}
	}
</style>
