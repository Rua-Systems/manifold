<script lang="ts">
	import { enhance } from '$app/forms';
	import { m } from '$lib/paraglide/messages.js';
	import { CODE_LENGTH } from '$lib/schemas/auth';
	import { getNotifications } from '$lib/state/notifications.svelte';
	import type { SecurityFormState } from '$lib/types/security';
	import type { FieldErrors } from '$lib/types/validation';
	import type { SubmitFunction } from '@sveltejs/kit';
	import BackupCodes from './BackupCodes.svelte';

	interface Props {
		enabled: boolean;
		form: SecurityFormState | null | undefined;
	}

	let { enabled, form }: Props = $props();

	const notifications = getNotifications();

	function errorsOf(name: SecurityFormState['form']): FieldErrors {
		if (form?.form !== name || !('errors' in form)) {
			return {};
		}
		return form.errors;
	}

	const setup = $derived(form?.form === 'twoFactorSetup' ? form : null);
	const backupCodes = $derived(form?.form === 'backupCodes' ? form.backupCodes : null);

	/** Groups the secret in fours so it can be read out and typed. */
	function grouped(secret: string): string {
		return secret.match(/.{1,4}/g)?.join(' ') ?? secret;
	}

	const confirmMessage: SubmitFunction = () => {
		return async ({ result, update }) => {
			if (result.type === 'success' && typeof result.data?.message === 'string') {
				if (result.data.message.length > 0) {
					notifications.confirm(result.data.message);
				}
			}
			await update();
		};
	};
</script>

{#snippet credentials(id: string, errors: FieldErrors)}
	<div class="field">
		<label for="{id}Password">{m.field_password()}</label>
		<input
			id="{id}Password"
			name="password"
			type="password"
			autocomplete="current-password"
			aria-invalid={(errors.password ?? '').length > 0}
			aria-describedby="{id}PasswordError"
		/>
		<p class="error" id="{id}PasswordError">{errors.password ?? ''}</p>
	</div>
	<div class="field">
		<label for="{id}Code">{m.field_totp_code()}</label>
		<input
			id="{id}Code"
			name="code"
			class="code"
			type="text"
			inputmode="numeric"
			autocomplete="one-time-code"
			maxlength={CODE_LENGTH}
			aria-invalid={(errors.code ?? '').length > 0}
			aria-describedby="{id}CodeError"
		/>
		<p class="error" id="{id}CodeError">{errors.code ?? ''}</p>
	</div>
{/snippet}

<div class="two-factor">
	<p class="status" class:on={enabled}>
		{enabled ? m.security_two_factor_on() : m.security_two_factor_off()}
	</p>

	{#if backupCodes !== null}
		<BackupCodes codes={backupCodes} />
	{/if}

	{#if !enabled && setup !== null}
		<form method="POST" action="?/confirmTwoFactor" use:enhance={confirmMessage} novalidate>
			<p class="lead">{m.security_two_factor_scan()}</p>
			<img
				class="qr"
				src={setup.qr}
				alt={m.security_two_factor_qr()}
				width="200"
				height="200"
			/>
			<p class="lead">{m.security_two_factor_manual()}</p>
			<p class="secret"><code>{grouped(setup.secret)}</code></p>
			<input type="hidden" name="totpUri" value={setup.totpUri} />
			<div class="field">
				<label for="twoFactorConfirmCode">{m.field_totp_code()}</label>
				<input
					id="twoFactorConfirmCode"
					name="code"
					class="code"
					type="text"
					inputmode="numeric"
					autocomplete="one-time-code"
					maxlength={CODE_LENGTH}
					aria-invalid={(setup.errors.code ?? '').length > 0}
					aria-describedby="twoFactorConfirmCodeError"
				/>
				<p class="error" id="twoFactorConfirmCodeError">{setup.errors.code ?? ''}</p>
			</div>
			<div class="submit">
				<button type="submit">{m.security_two_factor_confirm()}</button>
			</div>
		</form>
	{:else if !enabled}
		<form method="POST" action="?/startTwoFactor" use:enhance={confirmMessage} novalidate>
			<p class="lead">{m.security_two_factor_lead()}</p>
			<div class="field">
				<label for="twoFactorStartPassword">{m.field_password()}</label>
				<input
					id="twoFactorStartPassword"
					name="password"
					type="password"
					autocomplete="current-password"
					aria-invalid={(errorsOf('twoFactorStart').password ?? '').length > 0}
					aria-describedby="twoFactorStartPasswordError"
				/>
				<p class="error" id="twoFactorStartPasswordError">
					{errorsOf('twoFactorStart').password ?? ''}
				</p>
			</div>
			<div class="submit">
				<p class="notice" role="alert">
					{form?.form === 'twoFactorStart' ? form.message : ''}
				</p>
				<button type="submit">{m.security_two_factor_start()}</button>
			</div>
		</form>
	{:else}
		<form
			method="POST"
			action="?/regenerateBackupCodes"
			use:enhance={confirmMessage}
			novalidate
		>
			<h3>{m.security_backup_codes_new()}</h3>
			<p class="lead">{m.security_backup_codes_new_lead()}</p>
			{@render credentials('backupCodes', errorsOf('backupCodesRegenerate'))}
			<div class="submit">
				<button type="submit">{m.security_backup_codes_create()}</button>
			</div>
		</form>
		<form method="POST" action="?/disableTwoFactor" use:enhance={confirmMessage} novalidate>
			<h3>{m.security_two_factor_disable()}</h3>
			<p class="lead">{m.security_two_factor_disable_lead()}</p>
			{@render credentials('twoFactorDisable', errorsOf('twoFactorDisable'))}
			<div class="submit">
				<button type="submit" class="danger">{m.security_two_factor_disable()}</button>
			</div>
		</form>
	{/if}
</div>

<style lang="scss">
	@use '../../../styles/colors' as clr;
	@use '../../../styles/forms' as forms;
	@use '../../../styles/variables' as vars;

	.two-factor {
		display: flex;
		flex-direction: column;
		gap: 1.4rem;

		> .status {
			font-size: 0.78rem;
			letter-spacing: 0.14em;
			text-transform: uppercase;
			color: clr.$textMutedColor;

			&.on {
				color: clr.$accentColor;
			}
		}

		> form {
			display: flex;
			flex-direction: column;
			gap: 1rem;
			padding-bottom: 1.4rem;
			border-bottom: 1px solid clr.$borderMutedColor;

			> h3 {
				font-size: 0.86rem;
				letter-spacing: 0;
			}

			> .lead {
				font-size: 0.82rem;
				color: clr.$textSecondaryColor;
			}

			> .qr {
				width: 12.5rem;
				height: 12.5rem;
				border-radius: vars.$radius;
			}

			> .secret > code {
				font-size: 0.92rem;
				letter-spacing: 0.12em;
				color: clr.$textPrimaryColor;
				overflow-wrap: anywhere;
			}
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
			font-size: 1.1rem;
			letter-spacing: 0.4em;
		}

		> .error {
			@include forms.fieldError;
		}
	}

	.submit {
		@include forms.submitGroup;

		> button {
			@include forms.primaryButton;
			align-self: flex-start;

			&.danger:hover:not(:disabled) {
				color: clr.$errorColor;
				border-color: clr.$errorColor;
				background-image: none;
			}
		}
	}

	.notice {
		@include forms.formNotice;
	}

	@media (max-width: vars.$mobileMax) {
		.submit > button {
			align-self: stretch;
		}
	}
</style>
