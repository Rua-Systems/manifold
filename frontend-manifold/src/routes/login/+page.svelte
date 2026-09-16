<script lang="ts">
	import bgImage from '$lib/assets/images/login-bg.jpg';
	import { SITE_NAME, SITE_URL, pageTitle } from '$lib/constants';
</script>

<svelte:head>
	<title>{pageTitle('Login')}</title>
</svelte:head>

<div class="login-wrapper">
	<div class="login-left" style="--login-bg: url({bgImage})"></div>
	<div class="login-form">
		<div class="header">
			<a class="back" href="/">
				<span class="chevron" aria-hidden="true"></span>
				<span>Home</span>
			</a>
		</div>
		<div class="body">
			<div class="frame">
				<div class="intro">
					<p class="sigil">++ Ident Verification ++</p>
					<h1>Login</h1>
					<p class="lead">Authorization required to proceed.</p>
				</div>
				<div class="input-wrapper">
					<label>
						<span>Email</span>
						<input type="email" placeholder="Enter Email" />
					</label>
				</div>
				<div class="input-wrapper">
					<label>
						<span>Password</span>
						<input type="password" placeholder="Enter Password" />
					</label>
				</div>
				<div class="input-wrapper inline">
					<label>
						<input type="checkbox" />
						<span>Remember Me</span>
					</label>
				</div>
				<div class="button-wrapper">
					<button type="submit">Authenticate</button>
					<a href="/forgot-password">Forgot Password</a>
				</div>
			</div>
		</div>
		<div class="footer">
			<p>
				Developed by
				<a href={SITE_URL} target="_blank" rel="noreferrer">{SITE_NAME}</a>
			</p>
		</div>
	</div>
</div>

<style lang="scss">
	@use '../../styles/colors' as clr;
	@use '../../styles/variables' as vars;

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

	.login-wrapper {
		width: 100%;
		min-height: 100dvh;

		display: grid;
		grid-template-columns: 1.1fr 1fr;
	}

	.login-left {
		position: relative;
		overflow: hidden;
		background-color: clr.$surfaceColor;

		&::before {
			content: '';
			position: absolute;
			inset: 0;
			background-image: var(--login-bg);
			background-size: cover;
			background-position: center;
			animation: settleIn 1100ms cubic-bezier(0.22, 1, 0.36, 1) both;
		}

		&::after {
			content: '';
			position: absolute;
			inset: 0;
			box-shadow: inset -80px 0 80px -50px rgba(0, 0, 0, 0.9);
			background: linear-gradient(to top, clr.$scrimColor, transparent 55%);
		}
	}

	.login-form {
		display: flex;
		flex-direction: column;
		padding: clamp(1.4rem, 3.5vw, 2.6rem);

		> .header {
			display: flex;
			animation: riseIn 520ms cubic-bezier(0.22, 1, 0.36, 1) both;

			> .back {
				display: inline-flex;
				align-items: center;
				gap: 0.5rem;
				font-size: 0.72rem;
				letter-spacing: 0.16em;
				text-transform: uppercase;
				text-decoration: none;
				color: clr.$textMutedColor;
				transition:
					color 160ms ease,
					transform 160ms ease;

				> .chevron {
					width: 0.4rem;
					height: 0.4rem;
					border-left: 1px solid currentColor;
					border-bottom: 1px solid currentColor;
					transform: rotate(45deg);
				}

				&:hover {
					color: clr.$accentColor;
					transform: translateX(-3px);
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

		> .footer {
			display: flex;
			justify-content: center;
			animation: riseIn 520ms cubic-bezier(0.22, 1, 0.36, 1) both;
			animation-delay: 620ms;

			> p {
				font-size: 0.68rem;
				letter-spacing: 0.14em;
				text-transform: uppercase;
				color: clr.$textMutedColor;

				> a {
					color: clr.$textSecondaryColor;
					text-decoration: none;
					transition: color 160ms ease;

					&:hover {
						color: clr.$accentColor;
					}
				}
			}
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

		> * {
			animation: riseIn 560ms cubic-bezier(0.22, 1, 0.36, 1) both;
		}

		> *:nth-child(1) {
			animation-delay: 90ms;
		}

		> *:nth-child(2) {
			animation-delay: 160ms;
		}

		> *:nth-child(3) {
			animation-delay: 230ms;
		}

		> *:nth-child(4) {
			animation-delay: 300ms;
		}

		> *:nth-child(5) {
			animation-delay: 370ms;
		}
	}

	.intro {
		margin-bottom: 0.4rem;

		> .sigil {
			font-size: 0.66rem;
			letter-spacing: 0.3em;
			text-transform: uppercase;
			color: clr.$accentMutedColor;
		}

		> h1 {
			margin-top: 0.7rem;
			font-size: clamp(1.7rem, 3vw, 2.2rem);
			line-height: 1.1;
			letter-spacing: -0.03em;
		}

		> .lead {
			margin-top: 0.6rem;
			font-size: 0.88rem;
			color: clr.$textSecondaryColor;
		}
	}

	.input-wrapper {
		> label {
			display: block;

			> span {
				display: block;
				margin-bottom: 0.45rem;
				font-size: 0.68rem;
				letter-spacing: 0.18em;
				text-transform: uppercase;
				color: clr.$textMutedColor;
			}

			> input {
				width: 100%;
				padding: 0.7rem 0.85rem;
				font: inherit;
				font-size: 0.95rem;
				color: clr.$textPrimaryColor;
				background-color: clr.$surfaceColor;
				border: 1px solid clr.$borderSubtleColor;
				border-radius: vars.$radius;
				transition:
					border-color 160ms ease,
					background-color 160ms ease;

				&::placeholder {
					color: clr.$textMutedColor;
				}

				&:hover {
					background-color: clr.$surfaceHoverColor;
				}

				&:focus {
					outline: none;
					border-color: clr.$accentColor;
					background-color: clr.$surfaceHoverColor;
				}
			}
		}

		&.inline > label {
			display: flex;
			align-items: center;
			gap: 0.6rem;
			cursor: pointer;

			> span {
				margin-bottom: 0;
				font-size: 0.68rem;
				letter-spacing: 0.14em;
			}

			> input {
				width: auto;
				padding: 0;
				accent-color: clr.$accentColor;
				cursor: pointer;
			}
		}
	}

	.button-wrapper {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
		margin-top: 0.4rem;

		> button {
			padding: 0.72rem 1.6rem;
			font-size: 0.74rem;
			letter-spacing: 0.18em;
			text-transform: uppercase;
			color: clr.$textPrimaryColor;
			background-color: transparent;
			border: 1px solid clr.$accentMutedColor;
			border-radius: vars.$radius;
			cursor: pointer;
			transition:
				color 160ms ease,
				border-color 160ms ease,
				background-color 160ms ease,
				transform 160ms ease;

			&:hover {
				color: clr.$accentColor;
				border-color: clr.$accentColor;
				background-color: clr.$accentWashColor;
			}

			&:active {
				transform: translateY(1px);
			}
		}

		> a {
			font-size: 0.68rem;
			letter-spacing: 0.12em;
			text-transform: uppercase;
			text-decoration: none;
			color: clr.$textMutedColor;
			transition: color 160ms ease;

			&:hover {
				color: clr.$accentColor;
			}
		}
	}

	@media (max-width: 860px) {
		.login-wrapper {
			position: relative;
			grid-template-columns: 1fr;
		}

		.login-left {
			position: absolute;
			inset: 0;
			z-index: 0;

			&::before {
				inset: -30px;
				opacity: 0.3;
				filter: blur(10px);
			}

			&::after {
				box-shadow: none;
				background: linear-gradient(to bottom, clr.$scrimSoftColor, clr.$scrimStrongColor);
			}
		}

		.login-form {
			position: relative;
			z-index: 1;
			padding-top: 4.5rem;
		}
	}

	@media (max-width: 420px) {
		.button-wrapper {
			flex-direction: column;
			align-items: stretch;
			gap: 0.9rem;

			> button {
				width: 100%;
			}

			> a {
				text-align: center;
			}
		}
	}
</style>
