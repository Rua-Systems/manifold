<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import AuthShell from '$lib/components/AuthShell/AuthShell.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { CODE_LENGTH, codeSchema, emailSchema, newPasswordSchema } from '$lib/schemas/auth';
	import { Field, validateAll } from '$lib/state/field.svelte';
	import { getNotifications } from '$lib/state/notifications.svelte';
	import type { ResetStage } from '$lib/types/auth';
	import type { FieldErrors } from '$lib/types/validation';
	import { localizedHref } from '$lib/utils/navigation';
	import { pageTitle } from '$lib/utils/title';
	import { fromSchema, matches } from '$lib/utils/validation';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { onDestroy } from 'svelte';
	import type { PageProps } from './$types';

	const RESEND_SECONDS = 60;
	const RESEND_ACTION = '?/requestCode';

	let { form }: PageProps = $props();

	const notifications = getNotifications();
	const emailField = new Field([fromSchema(emailSchema)]);
	const codeField = new Field([fromSchema(codeSchema)]);
	const passwordField = new Field([fromSchema(newPasswordSchema)]);
	const confirmField = new Field([
		fromSchema(newPasswordSchema),
		matches(() => passwordField.value, m.validation_password_mismatch)
	]);

	let cooldown = $state(0);
	let codeInput: HTMLInputElement | undefined = $state();

	let timer: ReturnType<typeof setInterval> | undefined;

	const stage: ResetStage = $derived(form?.stage ?? 'request');
	const recipient = $derived(form?.email ?? emailField.value.trim());
	const notice = $derived(form?.message ?? '');
	const serverErrors: FieldErrors = $derived(form?.errors ?? {});

	$effect(() => {
		if (stage === 'verify') {
			codeInput?.focus();
		}
	});

	onDestroy(() => clearInterval(timer));

	function errorFor(field: Field, name: string): string {
		if (field.message.length > 0) {
			return field.message;
		}
		return serverErrors[name] ?? '';
	}

	function startCooldown(): void {
		cooldown = RESEND_SECONDS;
		clearInterval(timer);

		timer = setInterval(() => {
			cooldown -= 1;
			if (cooldown <= 0) {
				clearInterval(timer);
			}
		}, 1000);
	}

	function guardRequest(event: SubmitEvent): void {
		if (!validateAll([emailField])) {
			event.preventDefault();
		}
	}

	function guardReset(event: SubmitEvent): void {
		const submitter = event.submitter;
		if (submitter instanceof HTMLButtonElement && submitter.hasAttribute('formaction')) {
			return;
		}
		if (!validateAll([codeField, passwordField, confirmField])) {
			event.preventDefault();
		}
	}

	const handleRequest: SubmitFunction = () => {
		return async ({ result, update }) => {
			if (result.type === 'success') {
				notifications.confirm(m.reset_code_sent({ email: emailField.value.trim() }));
				startCooldown();
			}
			await update({ reset: false });
		};
	};

	const handleReset: SubmitFunction = ({ action }) => {
		const resending = action.search === RESEND_ACTION;

		return async ({ result, update }) => {
			if (result.type === 'redirect') {
				notifications.confirm(m.reset_success());
			}
			if (resending && result.type === 'success') {
				notifications.confirm(m.reset_code_resent());
				codeField.reset();
				startCooldown();
			}
			await update({ reset: false });
		};
	};
</script>

<svelte:head>
	<title>{pageTitle(page.data.organizationName, m.reset_title())}</title>
	<meta name="description" content={m.reset_meta_description()} />
</svelte:head>

<AuthShell>
	<div class="intro">
		<p class="sigil">++ {m.reset_sigil()} ++</p>
		<h1>{m.reset_title()}</h1>
		{#if stage === 'request'}
			<p class="lead">{m.reset_lead_request()}</p>
		{:else}
			<p class="lead">
				{m.reset_lead_verify_before()}
				<strong>{recipient}</strong>. {m.reset_lead_verify_after()}
			</p>
		{/if}
	</div>
	{#if stage === 'request'}
		<form
			class="step"
			method="POST"
			action="?/requestCode"
			onsubmit={guardRequest}
			use:enhance={handleRequest}
			novalidate
		>
			<input type="hidden" name="stage" value="request" />
			<div class="field">
				<label for="recoveryEmail">{m.field_email()}</label>
				<input
					id="recoveryEmail"
					name="email"
					type="email"
					autocomplete="email"
					placeholder={m.field_email_placeholder()}
					aria-invalid={errorFor(emailField, 'email').length > 0}
					aria-describedby="recoveryEmailError"
					bind:value={emailField.value}
					onblur={() => emailField.markTouched()}
				/>
				<p class="error" id="recoveryEmailError">{errorFor(emailField, 'email')}</p>
			</div>
			<div class="submit">
				<p class="notice" role="alert">{notice}</p>
				<div class="actions">
					<button type="submit">{m.common_send_code()}</button>
					<a href={localizedHref('/login')}>{m.common_back_to_login()}</a>
				</div>
			</div>
		</form>
	{:else}
		<form
			class="step"
			method="POST"
			action="?/reset"
			onsubmit={guardReset}
			use:enhance={handleReset}
			novalidate
		>
			<input type="hidden" name="stage" value="verify" />
			<input type="hidden" name="email" value={recipient} />
			<div class="field">
				<label for="recoveryCode">{m.field_code()}</label>
				<input
					bind:this={codeInput}
					id="recoveryCode"
					name="code"
					class="code"
					type="text"
					inputmode="numeric"
					autocomplete="one-time-code"
					maxlength={CODE_LENGTH}
					placeholder={'0'.repeat(CODE_LENGTH)}
					aria-invalid={errorFor(codeField, 'code').length > 0}
					aria-describedby="recoveryCodeError"
					bind:value={codeField.value}
					onblur={() => codeField.markTouched()}
				/>
				<p class="error" id="recoveryCodeError">{errorFor(codeField, 'code')}</p>
			</div>
			<div class="field">
				<label for="recoveryPassword">{m.field_new_password()}</label>
				<input
					id="recoveryPassword"
					name="password"
					type="password"
					autocomplete="new-password"
					placeholder={m.field_new_password_placeholder()}
					aria-invalid={errorFor(passwordField, 'password').length > 0}
					aria-describedby="recoveryPasswordError"
					bind:value={passwordField.value}
					onblur={() => passwordField.markTouched()}
				/>
				<p class="error" id="recoveryPasswordError">
					{errorFor(passwordField, 'password')}
				</p>
			</div>
			<div class="field">
				<label for="recoveryConfirm">{m.field_confirm_password()}</label>
				<input
					id="recoveryConfirm"
					name="confirmPassword"
					type="password"
					autocomplete="new-password"
					placeholder={m.field_confirm_password_placeholder()}
					aria-invalid={errorFor(confirmField, 'confirmPassword').length > 0}
					aria-describedby="recoveryConfirmError"
					bind:value={confirmField.value}
					onblur={() => confirmField.markTouched()}
				/>
				<p class="error" id="recoveryConfirmError">
					{errorFor(confirmField, 'confirmPassword')}
				</p>
			</div>
			<div class="submit">
				<p class="notice" role="alert">{notice}</p>
				<div class="actions">
					<button type="submit">{m.reset_submit()}</button>
					<button
						type="submit"
						class="quiet"
						formaction={RESEND_ACTION}
						disabled={cooldown > 0}
					>
						{#if cooldown > 0}
							{m.reset_resend_in({ seconds: cooldown })}
						{:else}
							{m.reset_resend()}
						{/if}
					</button>
				</div>
			</div>
			<div class="foot-row">
				<a href={localizedHref('/forgot-password')}>{m.reset_change_email()}</a>
				<a href={localizedHref('/login')}>{m.common_back_to_login()}</a>
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

			> strong {
				font-weight: 400;
				color: clr.$textPrimaryColor;
			}
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

	.actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;

		> button:not(.quiet) {
			@include forms.primaryButton;
		}

		> .quiet {
			@include forms.quietButton;
		}

		> a {
			@include forms.mutedLink;
		}
	}

	.foot-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
		padding-top: 0.9rem;
		border-top: 1px solid clr.$borderMutedColor;

		> a {
			@include forms.mutedLink;
		}
	}

	.submit {
		@include forms.submitGroup;
	}

	.notice {
		@include forms.formNotice;
	}

	@media (max-width: 420px) {
		.actions {
			flex-direction: column;
			align-items: stretch;
			gap: 0.9rem;

			> button:not(.quiet) {
				width: 100%;
			}

			> .quiet,
			> a {
				justify-content: center;
			}
		}
	}
</style>
