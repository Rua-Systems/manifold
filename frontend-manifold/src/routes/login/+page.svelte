<script lang="ts">
	import AuthShell from '$lib/components/AuthShell/AuthShell.svelte';
	import { pageTitle } from '$lib/constants';
	import { Field, validateAll } from '$lib/state/field.svelte';
	import { email, required } from '$lib/utils/validation';

	const emailField = new Field([required(), email()]);
	const passwordField = new Field([required()]);

	let remember = $state(false);

	function submit(event: SubmitEvent): void {
		event.preventDefault();
		if (!validateAll([emailField, passwordField])) {
			return;
		}
	}
</script>

<svelte:head>
	<title>{pageTitle('Login')}</title>
</svelte:head>

<AuthShell>
	<div class="intro">
		<p class="sigil">++ Ident Verification ++</p>
		<h1>Login</h1>
		<p class="lead">Authorization required to proceed.</p>
	</div>
	<form class="step" onsubmit={submit} novalidate>
		<div class="field">
			<label for="loginEmail">Email</label>
			<input
				id="loginEmail"
				type="email"
				autocomplete="email"
				placeholder="Enter Email"
				aria-invalid={emailField.showError}
				aria-describedby="loginEmailError"
				bind:value={emailField.value}
				onblur={() => emailField.markTouched()}
			/>
			{#if emailField.showError}
				<p class="error" id="loginEmailError">{emailField.error}</p>
			{/if}
		</div>
		<div class="field">
			<label for="loginPassword">Password</label>
			<input
				id="loginPassword"
				type="password"
				autocomplete="current-password"
				placeholder="Enter Password"
				aria-invalid={passwordField.showError}
				aria-describedby="loginPasswordError"
				bind:value={passwordField.value}
				onblur={() => passwordField.markTouched()}
			/>
			{#if passwordField.showError}
				<p class="error" id="loginPasswordError">{passwordField.error}</p>
			{/if}
		</div>
		<div class="field inline">
			<label>
				<input type="checkbox" bind:checked={remember} />
				<span>Remember Me</span>
			</label>
		</div>
		<div class="actions">
			<button type="submit">Authenticate</button>
			<a href="/forgot-password">Forgot Password</a>
		</div>
	</form>
</AuthShell>

<style lang="scss">
	@use '../../styles/colors' as clr;
	@use '../../styles/forms' as forms;

	.intro {
		margin-bottom: 0.4rem;

		> .sigil {
			@include forms.sigil;
		}

		> h1 {
			margin-top: 0.7rem;
			@include forms.heading;
		}

		> .lead {
			margin-top: 0.6rem;
			@include forms.lead;
		}
	}

	.step {
		display: flex;
		flex-direction: column;
		gap: 1.15rem;
	}

	.field {
		> label {
			@include forms.fieldLabel;
		}

		> input {
			@include forms.textInput;
		}

		> .error {
			@include forms.fieldError;
		}

		&.inline > label {
			display: flex;
			align-items: center;
			gap: 0.6rem;
			margin-bottom: 0;
			cursor: pointer;

			> span {
				font-size: 0.68rem;
				letter-spacing: 0.14em;
				text-transform: uppercase;
				color: clr.$textMutedColor;
			}

			> input {
				width: auto;
				padding: 0;
				accent-color: clr.$accentColor;
				cursor: pointer;
			}
		}
	}

	.actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
		margin-top: 0.4rem;

		> button {
			@include forms.primaryButton;
		}

		> a {
			@include forms.mutedLink;
		}
	}

	@media (max-width: 420px) {
		.actions {
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
