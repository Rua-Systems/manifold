<script lang="ts">
	import AuthShell from '$lib/components/AuthShell/AuthShell.svelte';
	import { pageTitle } from '$lib/constants';
	import { Field, validateAll } from '$lib/state/field.svelte';
	import { getNotifications } from '$lib/state/notifications.svelte';
	import { digits, email, required } from '$lib/utils/validation';
	import { onDestroy } from 'svelte';

	type Stage = 'request' | 'verify';

	const RESEND_SECONDS = 60;
	const CODE_LENGTH = 6;

	const notifications = getNotifications();
	const emailField = new Field([required(), email()]);
	const codeField = new Field([required(), digits(CODE_LENGTH)]);

	let stage = $state<Stage>('request');
	let cooldown = $state(0);
	let notice = $state('');
	let codeInput: HTMLInputElement | undefined = $state();

	let timer: ReturnType<typeof setInterval> | undefined;

	$effect(() => {
		if (stage === 'verify') {
			codeInput?.focus();
		}
	});

	onDestroy(() => clearInterval(timer));

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

	function requestCode(event: SubmitEvent): void {
		event.preventDefault();
		if (!validateAll([emailField])) {
			return;
		}

		notice = '';
		stage = 'verify';
		startCooldown();
		notifications.confirm(`Verification code sent to ${emailField.value.trim()}.`);
	}

	function resendCode(): void {
		if (cooldown > 0) {
			return;
		}

		notice = '';
		codeField.reset();
		startCooldown();
		notifications.confirm('A new verification code has been sent.');
	}

	function verifyCode(event: SubmitEvent): void {
		event.preventDefault();
		if (!validateAll([codeField])) {
			return;
		}

		notice = 'Verification endpoint is not connected yet.';
	}

	function changeEmail(): void {
		clearInterval(timer);
		codeField.reset();
		stage = 'request';
		cooldown = 0;
		notice = '';
	}
</script>

<svelte:head>
	<title>{pageTitle('Reset Password')}</title>
</svelte:head>

<AuthShell>
	<div class="intro">
		<p class="sigil">++ Access Recovery ++</p>
		<h1>Reset Password</h1>
		{#if stage === 'request'}
			<p class="lead">Enter your email and a verification code will be sent to it.</p>
		{:else}
			<p class="lead">
				A code was sent to <strong>{emailField.value}</strong>. Enter it below.
			</p>
		{/if}
	</div>
	{#if stage === 'request'}
		<form class="step" onsubmit={requestCode} novalidate>
			<div class="field">
				<label for="recoveryEmail">Email</label>
				<input
					id="recoveryEmail"
					type="email"
					autocomplete="email"
					placeholder="Enter Email"
					aria-invalid={emailField.showError}
					aria-describedby="recoveryEmailError"
					bind:value={emailField.value}
					onblur={() => emailField.markTouched()}
				/>
				<p class="error" id="recoveryEmailError">{emailField.message}</p>
			</div>
			<div class="actions">
				<button type="submit">Send Code</button>
				<a href="/login">Back to login</a>
			</div>
		</form>
	{:else}
		<form class="step" onsubmit={verifyCode} novalidate>
			<div class="field">
				<label for="recoveryCode">Verification Code</label>
				<input
					bind:this={codeInput}
					id="recoveryCode"
					class="code"
					type="text"
					inputmode="numeric"
					autocomplete="one-time-code"
					maxlength={CODE_LENGTH}
					placeholder="000000"
					aria-invalid={codeField.showError}
					aria-describedby="recoveryCodeError"
					bind:value={codeField.value}
					onblur={() => codeField.markTouched()}
				/>
				<p class="error" id="recoveryCodeError">{codeField.message}</p>
			</div>
			<div class="submit">
				<p class="notice" role="status">{notice}</p>
				<div class="actions">
					<button type="submit">Verify</button>
					<button
						type="button"
						class="quiet"
						onclick={resendCode}
						disabled={cooldown > 0}
					>
						{#if cooldown > 0}
							Resend in {cooldown}s
						{:else}
							Resend code
						{/if}
					</button>
				</div>
			</div>
			<div class="foot-row">
				<button type="button" class="quiet" onclick={changeEmail}>
					Use a different email
				</button>
				<a href="/login">Back to login</a>
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

		> button[type='submit'] {
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

		> .quiet {
			@include forms.quietButton;
		}

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

			> button[type='submit'] {
				width: 100%;
			}

			> .quiet,
			> a {
				text-align: center;
			}
		}
	}
</style>
