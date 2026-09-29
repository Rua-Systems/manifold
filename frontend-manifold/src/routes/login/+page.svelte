<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import AuthShell from '$lib/components/AuthShell/AuthShell.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import {
		CODE_LENGTH,
		codeSchema,
		emailSchema,
		identifierSchema,
		passwordSchema
	} from '$lib/schemas/auth';
	import { Field, validateAll } from '$lib/state/field.svelte';
	import { getNotifications } from '$lib/state/notifications.svelte';
	import type { LoginMethod } from '$lib/types/auth';
	import type { FieldErrors } from '$lib/types/validation';
	import { localizedHref } from '$lib/utils/navigation';
	import { pageTitle } from '$lib/utils/title';
	import { fromSchema } from '$lib/utils/validation';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();

	const notifications = getNotifications();
	const identifierField = new Field([fromSchema(identifierSchema)]);
	const emailField = new Field([fromSchema(emailSchema)]);
	const passwordField = new Field([fromSchema(passwordSchema)]);
	const codeField = new Field([fromSchema(codeSchema)]);

	function initialMethod(): LoginMethod {
		return form?.method ?? 'password';
	}

	let method = $state<LoginMethod>(initialMethod());

	const emailEnabled = $derived(page.data.features.email);
	let hideServerMessage = $state(false);

	const redirectTo = $derived(page.url.searchParams.get('redirectTo') ?? '');
	const codeSent = $derived(form?.sent === true);

	const serverMessage = $derived.by(() => {
		if (hideServerMessage) {
			return '';
		}
		return form?.message ?? '';
	});

	const serverErrors: FieldErrors = $derived.by(() => {
		if (hideServerMessage) {
			return {};
		}
		return form?.errors ?? {};
	});

	function errorFor(field: Field, name: string): string {
		if (field.message.length > 0) {
			return field.message;
		}
		return serverErrors[name] ?? '';
	}

	function selectMethod(next: LoginMethod): void {
		if (next === method) {
			return;
		}

		method = next;
		hideServerMessage = true;
		identifierField.clearError();
		emailField.clearError();
		passwordField.clearError();
		codeField.clearError();
	}

	function guardPassword(event: SubmitEvent): void {
		if (!validateAll([identifierField, passwordField])) {
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
	<title>{pageTitle(page.data.organizationName, m.login_title())}</title>
	<meta name="description" content={m.login_meta_description()} />
</svelte:head>

<AuthShell>
	<div class="intro">
		<p class="sigil">++ {m.login_sigil()} ++</p>
		<h1>{m.login_title()}</h1>
		<p class="lead">{m.login_lead()}</p>
	</div>
	{#if emailEnabled}
		<div class="methods" role="group" aria-label={m.login_method_label()}>
			<button
				type="button"
				aria-pressed={method === 'password'}
				onclick={() => selectMethod('password')}
			>
				{m.login_method_password()}
			</button>
			<button
				type="button"
				aria-pressed={method === 'code'}
				onclick={() => selectMethod('code')}
			>
				{m.login_method_code()}
			</button>
		</div>
	{/if}
	{#if method === 'password' || !emailEnabled}
		<form method="POST" action="?/password" use:enhance onsubmit={guardPassword} novalidate>
			<input type="hidden" name="redirectTo" value={redirectTo} />
			<div class="field">
				<label for="loginIdentifier">{m.field_identifier()}</label>
				<input
					id="loginIdentifier"
					name="identifier"
					type="text"
					autocomplete="username"
					autocapitalize="none"
					spellcheck="false"
					placeholder={m.field_identifier_placeholder()}
					aria-invalid={errorFor(identifierField, 'identifier').length > 0}
					aria-describedby="loginIdentifierError"
					bind:value={identifierField.value}
					onblur={() => identifierField.markTouched()}
				/>
				<p class="error" id="loginIdentifierError">
					{errorFor(identifierField, 'identifier')}
				</p>
			</div>
			<div class="field">
				<label for="loginPassword">{m.field_password()}</label>
				<input
					id="loginPassword"
					name="password"
					type="password"
					autocomplete="current-password"
					placeholder={m.field_password_placeholder()}
					aria-invalid={errorFor(passwordField, 'password').length > 0}
					aria-describedby="loginPasswordError"
					bind:value={passwordField.value}
					onblur={() => passwordField.markTouched()}
				/>
				<p class="error" id="loginPasswordError">{errorFor(passwordField, 'password')}</p>
			</div>
			<div class="submit">
				<p class="notice" role="alert">{serverMessage}</p>
				<div class="actions">
					<button type="submit">{m.login_submit()}</button>
					{#if emailEnabled}
						<a href={localizedHref('/forgot-password')}>{m.login_forgot_password()}</a>
					{/if}
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
						notifications.confirm(m.login_code_sent_notice());
					}
					await update({ reset: false });
				};
			}}
		>
			<input type="hidden" name="redirectTo" value={redirectTo} />
			<div class="field">
				<label for="codeEmail">{m.field_email()}</label>
				<input
					id="codeEmail"
					name="email"
					type="email"
					autocomplete="email"
					placeholder={m.field_email_placeholder()}
					aria-invalid={errorFor(emailField, 'email').length > 0}
					aria-describedby="codeEmailError"
					bind:value={emailField.value}
					onblur={() => emailField.markTouched()}
				/>
				<p class="error" id="codeEmailError">{errorFor(emailField, 'email')}</p>
			</div>
			<div class="submit">
				<p class="notice" role="alert">{serverMessage}</p>
				<div class="actions">
					<button type="submit">{m.common_send_code()}</button>
					<a href={localizedHref('/forgot-password')}>{m.login_forgot_password()}</a>
				</div>
			</div>
		</form>
	{:else}
		<form method="POST" action="?/verifyCode" use:enhance onsubmit={guardCode} novalidate>
			<input type="hidden" name="redirectTo" value={redirectTo} />
			<input type="hidden" name="email" value={form?.identifier ?? emailField.value} />
			<p class="sent">{m.login_code_sent_to()} <strong>{form?.identifier}</strong></p>
			<div class="field">
				<label for="loginCode">{m.field_code()}</label>
				<input
					id="loginCode"
					name="code"
					class="code"
					type="text"
					inputmode="numeric"
					autocomplete="one-time-code"
					maxlength={CODE_LENGTH}
					placeholder={'0'.repeat(CODE_LENGTH)}
					aria-invalid={errorFor(codeField, 'code').length > 0}
					aria-describedby="loginCodeError"
					bind:value={codeField.value}
					onblur={() => codeField.markTouched()}
				/>
				<p class="error" id="loginCodeError">{errorFor(codeField, 'code')}</p>
			</div>
			<div class="submit">
				<p class="notice" role="alert">{serverMessage}</p>
				<div class="actions">
					<button type="submit">{m.common_verify()}</button>
					<a href={localizedHref('/login')}>{m.login_start_over()}</a>
				</div>
			</div>
		</form>
	{/if}
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

	.methods {
		@include forms.segmentedControl;

		> button {
			@include forms.segmentedOption;

			&[aria-pressed='true'] {
				@include forms.segmentedOptionActive;
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
				justify-content: center;
			}
		}
	}
</style>
