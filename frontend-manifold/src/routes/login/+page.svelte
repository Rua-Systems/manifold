<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import AuthShell from '$lib/components/AuthShell/AuthShell.svelte';
	import { pageTitle } from '$lib/constants';
	import { Field, validateAll } from '$lib/state/field.svelte';
	import { getNotifications } from '$lib/state/notifications.svelte';
	import { digits, email as emailRule, required } from '$lib/utils/validation';
	import type { PageProps } from './$types';

	type Method = 'password' | 'code';

	const CODE_LENGTH = 6;

	let { form }: PageProps = $props();

	const notifications = getNotifications();
	const emailField = new Field([required(), emailRule()]);
	const passwordField = new Field([required()]);
	const codeField = new Field([required(), digits(CODE_LENGTH)]);

	function initialMethod(): Method {
		if (form !== null && form !== undefined && form.sent) {
			return 'code';
		}
		return 'password';
	}

	let method = $state<Method>(initialMethod());
	let hideServerMessage = $state(false);

	const redirectTo = $derived(page.url.searchParams.get('redirectTo') ?? '');
	const codeSent = $derived(form !== null && form !== undefined && form.sent);

	const serverMessage = $derived.by(() => {
		if (hideServerMessage) {
			return '';
		}
		return form?.message ?? '';
	});

	function selectMethod(next: Method): void {
		if (next === method) {
			return;
		}

		method = next;
		hideServerMessage = true;
		emailField.clearError();
		passwordField.clearError();
		codeField.clearError();
	}

	function guardPassword(event: SubmitEvent): void {
		if (!validateAll([emailField, passwordField])) {
			event.preventDefault();
			return;
		}
		hideServerMessage = false;
	}

	function guardEmail(event: SubmitEvent): void {
		if (!validateAll([emailField])) {
			event.preventDefault();
			return;
		}
		hideServerMessage = false;
	}

	function guardCode(event: SubmitEvent): void {
		if (!validateAll([codeField])) {
			event.preventDefault();
			return;
		}
		hideServerMessage = false;
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
	<div class="methods" role="group" aria-label="Login method">
		<button
			type="button"
			class:active={method === 'password'}
			onclick={() => selectMethod('password')}
		>
			Password
		</button>
		<button type="button" class:active={method === 'code'} onclick={() => selectMethod('code')}>
			Email Code
		</button>
	</div>
	{#if method === 'password'}
		<form method="POST" action="?/password" use:enhance onsubmit={guardPassword} novalidate>
			<input type="hidden" name="redirectTo" value={redirectTo} />
			<div class="field">
				<label for="loginEmail">Email</label>
				<input
					id="loginEmail"
					name="email"
					type="email"
					autocomplete="email"
					placeholder="Enter Email"
					aria-invalid={emailField.showError}
					aria-describedby="loginEmailError"
					bind:value={emailField.value}
					onblur={() => emailField.markTouched()}
				/>
				<p class="error" id="loginEmailError">{emailField.message}</p>
			</div>
			<div class="field">
				<label for="loginPassword">Password</label>
				<input
					id="loginPassword"
					name="password"
					type="password"
					autocomplete="current-password"
					placeholder="Enter Password"
					aria-invalid={passwordField.showError}
					aria-describedby="loginPasswordError"
					bind:value={passwordField.value}
					onblur={() => passwordField.markTouched()}
				/>
				<p class="error" id="loginPasswordError">{passwordField.message}</p>
			</div>
			<div class="submit">
				<p class="notice" role="alert">{serverMessage}</p>
				<div class="actions">
					<button type="submit">Authenticate</button>
					<a href="/forgot-password">Forgot Password</a>
				</div>
			</div>
		</form>
	{:else if !codeSent}
		<form
			method="POST"
			action="?/requestCode"
			onsubmit={guardEmail}
			novalidate
			use:enhance={() => {
				return async ({ result, update }) => {
					if (result.type === 'success') {
						notifications.confirm('A sign in code has been sent.');
					}
					await update({ reset: false });
				};
			}}
		>
			<input type="hidden" name="redirectTo" value={redirectTo} />
			<div class="field">
				<label for="codeEmail">Email</label>
				<input
					id="codeEmail"
					name="email"
					type="email"
					autocomplete="email"
					placeholder="Enter Email"
					aria-invalid={emailField.showError}
					aria-describedby="codeEmailError"
					bind:value={emailField.value}
					onblur={() => emailField.markTouched()}
				/>
				<p class="error" id="codeEmailError">{emailField.message}</p>
			</div>
			<div class="submit">
				<p class="notice" role="alert">{serverMessage}</p>
				<div class="actions">
					<button type="submit">Send Code</button>
					<a href="/forgot-password">Forgot Password</a>
				</div>
			</div>
		</form>
	{:else}
		<form method="POST" action="?/verifyCode" use:enhance onsubmit={guardCode} novalidate>
			<input type="hidden" name="redirectTo" value={redirectTo} />
			<input type="hidden" name="email" value={form?.email ?? emailField.value} />
			<p class="sent">Code sent to <strong>{form?.email}</strong></p>
			<div class="field">
				<label for="loginCode">Verification Code</label>
				<input
					id="loginCode"
					name="code"
					class="code"
					type="text"
					inputmode="numeric"
					autocomplete="one-time-code"
					maxlength={CODE_LENGTH}
					placeholder="000000"
					aria-invalid={codeField.showError}
					aria-describedby="loginCodeError"
					bind:value={codeField.value}
					onblur={() => codeField.markTouched()}
				/>
				<p class="error" id="loginCodeError">{codeField.message}</p>
			</div>
			<div class="submit">
				<p class="notice" role="alert">{serverMessage}</p>
				<div class="actions">
					<button type="submit">Verify</button>
					<a href="/login">Start over</a>
				</div>
			</div>
		</form>
	{/if}
</AuthShell>

<style lang="scss">
	@use '../../styles/colors' as clr;
	@use '../../styles/forms' as forms;
	@use '../../styles/variables' as vars;

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

	.methods {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 2px;
		padding: 2px;
		border: 1px solid clr.$borderSubtleColor;
		border-radius: vars.$radius;

		> button {
			padding: 0.6rem 0.5rem;
			font-size: 0.66rem;
			letter-spacing: 0.16em;
			text-transform: uppercase;
			color: clr.$textMutedColor;
			background-color: transparent;
			border: 0;
			border-radius: 2px;
			cursor: pointer;
			transition:
				color 160ms ease,
				background-color 160ms ease;

			&:hover {
				color: clr.$textPrimaryColor;
			}

			&.active {
				color: clr.$accentColor;
				background-color: clr.$accentWashColor;
			}
		}
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 1.15rem;
	}

	.sent {
		font-size: 0.78rem;
		color: clr.$textSecondaryColor;

		> strong {
			font-weight: 400;
			color: clr.$textPrimaryColor;
		}
	}

	.field {
		> label {
			@include forms.fieldLabel;
		}

		> input {
			@include forms.textInput;
		}

		> .code {
			padding-block: 0.9rem;
			font-size: 1.3rem;
			letter-spacing: 0.7em;
			text-indent: 0.7em;
			text-align: center;
		}

		> .error {
			@include forms.fieldError;
		}
	}

	.submit {
		@include forms.submitGroup;
	}

	.notice {
		@include forms.formNotice;
	}

	.actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;

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
