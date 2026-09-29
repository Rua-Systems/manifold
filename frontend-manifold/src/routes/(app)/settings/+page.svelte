<script lang="ts">
	import { version } from '$app/environment';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import Credit from '$lib/components/Credit/Credit.svelte';
	import PageShell from '$lib/components/PageShell/PageShell.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import {
		displayNameSchema,
		emailSchema,
		newPasswordSchema,
		passwordSchema,
		usernameSchema
	} from '$lib/schemas/auth';
	import { Field, validateAll } from '$lib/state/field.svelte';
	import { getNotifications } from '$lib/state/notifications.svelte';
	import type { SettingsForm } from '$lib/types/settings';
	import { fromSchema, matches } from '$lib/utils/validation';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { untrack } from 'svelte';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();

	const notifications = getNotifications();
	const initial = untrack(() => page.data.user);

	const nameField = new Field([fromSchema(displayNameSchema)], initial?.name ?? '');
	const usernameField = new Field([fromSchema(usernameSchema)], initial?.username ?? '');
	const emailField = new Field([fromSchema(emailSchema)], initial?.email ?? '');
	const currentPasswordField = new Field([fromSchema(passwordSchema)]);
	const passwordField = new Field([fromSchema(newPasswordSchema)]);
	const confirmField = new Field([
		fromSchema(newPasswordSchema),
		matches(() => passwordField.value, m.validation_password_mismatch)
	]);

	function serverError(section: SettingsForm, name: string): string {
		if (form?.form !== section || form.success) {
			return '';
		}
		return form.errors[name] ?? '';
	}

	function errorFor(field: Field, section: SettingsForm, name: string): string {
		if (field.message.length > 0) {
			return field.message;
		}
		return serverError(section, name);
	}

	function noticeFor(section: SettingsForm): string {
		if (form?.form !== section || form.success) {
			return '';
		}
		return form.message;
	}

	function guard(fields: Field[]): (event: SubmitEvent) => void {
		return (event) => {
			if (!validateAll(fields)) {
				event.preventDefault();
			}
		};
	}

	const confirmOnSuccess: SubmitFunction = () => {
		return async ({ result, update }) => {
			if (result.type === 'success' && typeof result.data?.message === 'string') {
				notifications.confirm(result.data.message);
			}
			await update({ reset: false });
		};
	};

	const confirmPasswordChange: SubmitFunction = () => {
		return async ({ result, update }) => {
			if (result.type === 'success' && typeof result.data?.message === 'string') {
				notifications.confirm(result.data.message);
				currentPasswordField.reset();
				passwordField.reset();
				confirmField.reset();
			}
			await update({ reset: false });
		};
	};
</script>

<PageShell
	title={m.settings_title()}
	sigil={m.account_sigil()}
	metaDescription={m.settings_meta_description()}
>
	<nav class="sections" aria-label={m.settings_sections_label()}>
		<a href="#profile">{m.settings_section_profile()}</a>
		<a href="#about">{m.settings_section_about()}</a>
	</nav>
	<section id="profile" class="section" aria-labelledby="profileHeading">
		<h2 id="profileHeading">{m.settings_section_profile()}</h2>
		<form
			method="POST"
			action="?/profile"
			use:enhance={confirmOnSuccess}
			onsubmit={guard([nameField, usernameField])}
			novalidate
		>
			<div class="field">
				<label for="settingsName">{m.field_display_name()}</label>
				<input
					id="settingsName"
					name="name"
					type="text"
					autocomplete="name"
					aria-invalid={errorFor(nameField, 'profile', 'name').length > 0}
					aria-describedby="settingsNameError"
					bind:value={nameField.value}
					onblur={() => nameField.markTouched()}
				/>
				<p class="error" id="settingsNameError">{errorFor(nameField, 'profile', 'name')}</p>
			</div>
			<div class="field">
				<label for="settingsUsername">{m.field_username()}</label>
				<input
					id="settingsUsername"
					name="username"
					type="text"
					autocomplete="username"
					autocapitalize="none"
					spellcheck="false"
					aria-invalid={errorFor(usernameField, 'profile', 'username').length > 0}
					aria-describedby="settingsUsernameError"
					bind:value={usernameField.value}
					onblur={() => usernameField.markTouched()}
				/>
				<p class="error" id="settingsUsernameError">
					{errorFor(usernameField, 'profile', 'username')}
				</p>
			</div>
			<div class="submit">
				<p class="notice" role="alert">{noticeFor('profile')}</p>
				<button type="submit">{m.settings_save()}</button>
			</div>
		</form>
		<form
			method="POST"
			action="?/email"
			use:enhance={confirmOnSuccess}
			onsubmit={guard([emailField])}
			novalidate
		>
			<div class="field">
				<label for="settingsEmail">{m.field_email()}</label>
				<input
					id="settingsEmail"
					name="email"
					type="email"
					autocomplete="email"
					aria-invalid={errorFor(emailField, 'email', 'email').length > 0}
					aria-describedby="settingsEmailError"
					bind:value={emailField.value}
					onblur={() => emailField.markTouched()}
				/>
				<p class="error" id="settingsEmailError">
					{errorFor(emailField, 'email', 'email')}
				</p>
			</div>
			<div class="submit">
				<p class="notice" role="alert">{noticeFor('email')}</p>
				<button type="submit">{m.settings_change_email()}</button>
			</div>
		</form>
		<form
			method="POST"
			action="?/password"
			use:enhance={confirmPasswordChange}
			onsubmit={guard([currentPasswordField, passwordField, confirmField])}
			novalidate
		>
			<div class="field">
				<label for="settingsCurrentPassword">{m.field_current_password()}</label>
				<input
					id="settingsCurrentPassword"
					name="currentPassword"
					type="password"
					autocomplete="current-password"
					aria-invalid={errorFor(currentPasswordField, 'password', 'currentPassword')
						.length > 0}
					aria-describedby="settingsCurrentPasswordError"
					bind:value={currentPasswordField.value}
					onblur={() => currentPasswordField.markTouched()}
				/>
				<p class="error" id="settingsCurrentPasswordError">
					{errorFor(currentPasswordField, 'password', 'currentPassword')}
				</p>
			</div>
			<div class="field">
				<label for="settingsNewPassword">{m.field_new_password()}</label>
				<input
					id="settingsNewPassword"
					name="password"
					type="password"
					autocomplete="new-password"
					aria-invalid={errorFor(passwordField, 'password', 'password').length > 0}
					aria-describedby="settingsNewPasswordError"
					bind:value={passwordField.value}
					onblur={() => passwordField.markTouched()}
				/>
				<p class="error" id="settingsNewPasswordError">
					{errorFor(passwordField, 'password', 'password')}
				</p>
			</div>
			<div class="field">
				<label for="settingsConfirmPassword">{m.field_confirm_password()}</label>
				<input
					id="settingsConfirmPassword"
					name="confirmPassword"
					type="password"
					autocomplete="new-password"
					aria-invalid={errorFor(confirmField, 'password', 'confirmPassword').length > 0}
					aria-describedby="settingsConfirmPasswordError"
					bind:value={confirmField.value}
					onblur={() => confirmField.markTouched()}
				/>
				<p class="error" id="settingsConfirmPasswordError">
					{errorFor(confirmField, 'password', 'confirmPassword')}
				</p>
			</div>
			<div class="submit">
				<p class="notice" role="alert">{noticeFor('password')}</p>
				<button type="submit">{m.settings_change_password()}</button>
			</div>
		</form>
	</section>
	<section id="about" class="section" aria-labelledby="aboutHeading">
		<h2 id="aboutHeading">{m.settings_section_about()}</h2>
		<Credit />
		<dl class="record">
			<div class="row">
				<dt>{m.settings_about_version()}</dt>
				<dd>{version}</dd>
			</div>
		</dl>
	</section>
</PageShell>

<style lang="scss">
	@use '../../../styles/colors' as clr;
	@use '../../../styles/forms' as forms;
	@use '../../../styles/variables' as vars;

	.sections {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem 1.2rem;
		margin-bottom: 1.5rem;

		> a {
			@include forms.mutedLink;
		}
	}

	.section {
		display: flex;
		flex-direction: column;
		gap: 1.6rem;
		max-width: 32rem;
		margin-bottom: 2.6rem;
		scroll-margin-top: 5rem;

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

		> form {
			display: flex;
			flex-direction: column;
			gap: 1.15rem;
			padding-bottom: 1.6rem;
			border-bottom: 1px solid clr.$borderMutedColor;
		}
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
	}

	.submit {
		@include forms.submitGroup;

		> button {
			@include forms.primaryButton;
			align-self: flex-start;
		}
	}

	.notice {
		@include forms.formNotice;
	}

	.record {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		margin: 0;

		> .row {
			display: grid;
			grid-template-columns: 9rem 1fr;
			gap: 1rem;

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
			}
		}
	}

	@media (max-width: vars.$mobileMax) {
		.submit > button {
			align-self: stretch;
		}
	}
</style>
