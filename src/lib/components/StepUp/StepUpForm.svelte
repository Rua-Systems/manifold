<script lang="ts">
	import { enhance } from '$app/forms';
	import { m } from '$lib/paraglide/messages.js';
	import { CODE_LENGTH } from '$lib/schemas/auth';
	import type { FieldErrors } from '$lib/types/validation';
	import { localizedHref } from '$lib/utils/navigation';
	import type { SubmitFunction } from '@sveltejs/kit';

	interface Props {
		/** Distinguishes the dialog's fields from the page's. */
		id: string;
		twoFactorEnabled: boolean;
		/** Where the page version returns after confirming. */
		redirectTo?: string;
		/** Set in the dialog: called on success instead of following the page's flow. */
		onconfirmed?: () => void;
		serverErrors?: FieldErrors;
		serverMessage?: string;
	}

	let {
		id,
		twoFactorEnabled,
		redirectTo = '',
		onconfirmed,
		serverErrors = {},
		serverMessage = ''
	}: Props = $props();

	let localErrors = $state<FieldErrors | null>(null);
	let localMessage = $state('');
	let pending = $state(false);

	const errors = $derived(localErrors ?? serverErrors);
	const message = $derived(localErrors === null ? serverMessage : localMessage);

	const submit: SubmitFunction = () => {
		pending = true;
		return async ({ result, update }) => {
			pending = false;
			if (onconfirmed === undefined) {
				await update();
				return;
			}
			if (result.type === 'success') {
				localErrors = null;
				onconfirmed();
				return;
			}
			if (result.type === 'failure') {
				localErrors = (result.data?.errors as FieldErrors | undefined) ?? {};
				localMessage = typeof result.data?.message === 'string' ? result.data.message : '';
				return;
			}
			localErrors = {};
			localMessage = m.settings_error_generic();
		};
	};
</script>

<form
	method="POST"
	action="{localizedHref('/step-up')}?/confirm"
	class="step-up"
	use:enhance={submit}
	novalidate
>
	<p class="lead">
		{twoFactorEnabled ? m.step_up_lead_two_factor() : m.step_up_lead()}
	</p>
	<input type="hidden" name="redirectTo" value={redirectTo} />
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
	{#if twoFactorEnabled}
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
	{/if}
	<div class="submit">
		<p class="notice" role="alert">{message}</p>
		<button type="submit" disabled={pending}>{m.step_up_confirm()}</button>
	</div>
</form>

<style lang="scss">
	@use '../../../styles/colors' as clr;
	@use '../../../styles/forms' as forms;

	.step-up {
		display: flex;
		flex-direction: column;
		gap: 1.1rem;

		> .lead {
			@include forms.lead;
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
		}
	}

	.notice {
		@include forms.formNotice;
		color: clr.$errorColor;
	}
</style>
