<script lang="ts">
	import { enhance } from '$app/forms';
	import { m } from '$lib/paraglide/messages.js';
	import { getNotifications } from '$lib/state/notifications.svelte';
	import { getStepUp, needsStepUp } from '$lib/state/step-up.svelte';
	import type { FieldErrors } from '$lib/types/validation';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { untrack } from 'svelte';
	import { SECRET_LABELS } from '../labels';
	import { DATA_SOURCE_DESCRIPTION_MAX_LENGTH, DATA_SOURCE_NAME_MAX_LENGTH } from '../schemas';
	import type {
		ApiSettings,
		DatabaseSettings,
		DataSourceType,
		DataSourceView,
		LinkSettings,
		RedisSettings,
		S3Settings,
		SecretName,
		SshSettings
	} from '../types';

	interface Props {
		type: DataSourceType;
		/** Null to add a source. */
		source: DataSourceView | null;
		/** Errors the action answered without JavaScript. */
		serverErrors: FieldErrors;
		onsaved?: (message: string) => void;
		oncancel?: () => void;
	}

	let { type, source, serverErrors, onsaved, oncancel }: Props = $props();

	const notifications = getNotifications();
	const stepUp = getStepUp();

	const DEFAULT_SSH: SshSettings = {
		enabled: false,
		host: '',
		port: 22,
		username: '',
		auth: 'password',
		fingerprint: ''
	};

	// The stored settings as loose fields: each type reads the ones it has.
	const stored = untrack(
		() =>
			(source?.settings ?? {}) as Partial<
				DatabaseSettings & RedisSettings & S3Settings & ApiSettings & LinkSettings
			>
	);
	const storedSsh = untrack(() => {
		const ssh = (source?.settings as { ssh?: SshSettings } | undefined)?.ssh;
		return ssh ?? DEFAULT_SSH;
	});
	const saved = untrack(() => new Set<SecretName>(source?.secrets ?? []));

	let errors = $state<FieldErrors>(untrack(() => serverErrors));
	let sshEnabled = $state(storedSsh.enabled);
	let sshAuth = $state(storedSsh.auth);
	let apiAuth = $state<ApiSettings['auth']>(
		untrack(() => stored.auth ?? 'none') as ApiSettings['auth']
	);
	let linkAuth = $state<LinkSettings['auth']>(
		untrack(() => stored.auth ?? 'none') as LinkSettings['auth']
	);

	const isDatabase = $derived(type === 'postgresql' || type === 'mysql');
	const canTunnel = $derived(isDatabase || type === 'redis');

	function defaultPort(): number {
		if (type === 'mysql') {
			return 3306;
		}
		if (type === 'redis') {
			return 6379;
		}
		return 5432;
	}

	function error(name: string): string {
		return errors[name] ?? '';
	}

	function invalid(name: string): boolean {
		return error(name).length > 0;
	}

	const submit: SubmitFunction = ({ formElement, submitter }) => {
		return async ({ result, update }) => {
			if (needsStepUp(result)) {
				if (await stepUp.request()) {
					formElement.requestSubmit(submitter);
				}
				return;
			}
			if (result.type === 'failure') {
				errors = (result.data?.errors as FieldErrors | undefined) ?? {};
				if (typeof result.data?.message === 'string') {
					notifications.fault(result.data.message);
				}
				return;
			}
			errors = {};
			if (result.type === 'redirect') {
				notifications.confirm(m.datasources_created());
			}
			if (result.type === 'success' && typeof result.data?.message === 'string') {
				onsaved?.(result.data.message);
			}
			await update({ reset: false });
		};
	};
</script>

{#snippet text(
	name: string,
	label: string,
	value: string | number,
	options: { type?: string; placeholder?: string; hint?: string; inputmode?: 'url' | 'numeric' }
)}
	{@const id = `ds-${name.replace('.', '-')}`}
	<div class="field">
		<label for={id}>{label}</label>
		<input
			{id}
			{name}
			type={options.type ?? 'text'}
			inputmode={options.inputmode}
			autocomplete="off"
			spellcheck="false"
			placeholder={options.placeholder}
			{value}
			aria-invalid={invalid(name)}
			aria-describedby="{id}-hint {id}-error"
		/>
		{#if options.hint !== undefined}
			<p class="hint" id="{id}-hint">{options.hint}</p>
		{/if}
		<p class="error" id="{id}-error">{error(name)}</p>
	</div>
{/snippet}

{#snippet secret(name: SecretName, multiline: boolean)}
	{@const id = `ds-secret-${name}`}
	{@const isSaved = saved.has(name)}
	<div class="field">
		<label for={id}>{SECRET_LABELS[name]()}</label>
		{#if multiline}
			<textarea
				{id}
				{name}
				rows="4"
				autocomplete="off"
				spellcheck="false"
				class="mono"
				placeholder={isSaved ? m.datasources_secret_saved_placeholder() : ''}
				aria-invalid={invalid(name)}
				aria-describedby="{id}-hint {id}-error"></textarea>
		{:else}
			<input
				{id}
				{name}
				type="password"
				autocomplete="new-password"
				spellcheck="false"
				placeholder={isSaved ? m.datasources_secret_saved_placeholder() : ''}
				aria-invalid={invalid(name)}
				aria-describedby="{id}-hint {id}-error"
			/>
		{/if}
		{#if isSaved}
			<div class="hint-row" id="{id}-hint">
				<span class="hint">{m.datasources_secret_keep_hint()}</span>
				<label class="check small">
					<input type="checkbox" name="remove.{name}" />
					<span>{m.datasources_secret_remove()}</span>
				</label>
			</div>
		{/if}
		<p class="error" id="{id}-error">{error(name)}</p>
	</div>
{/snippet}

<form
	method="POST"
	action={source === null ? '?/create' : '?/update'}
	class="source-form"
	use:enhance={submit}
	novalidate
>
	<input type="hidden" name="type" value={type} />

	<fieldset>
		<legend>{m.datasources_section_general()}</legend>
		<div class="field">
			<label for="ds-name">{m.datasources_name()}</label>
			<input
				id="ds-name"
				name="name"
				type="text"
				autocomplete="off"
				maxlength={DATA_SOURCE_NAME_MAX_LENGTH}
				value={source?.name ?? ''}
				aria-invalid={invalid('name')}
				aria-describedby="ds-name-error"
			/>
			<p class="error" id="ds-name-error">{error('name')}</p>
		</div>
		<div class="field">
			<label for="ds-description">{m.datasources_description()}</label>
			<textarea
				id="ds-description"
				name="description"
				rows="4"
				maxlength={DATA_SOURCE_DESCRIPTION_MAX_LENGTH}
				aria-invalid={invalid('description')}
				aria-describedby="ds-description-hint ds-description-error"
				>{source?.description ?? ''}</textarea
			>
			<p class="hint" id="ds-description-hint">{m.datasources_description_hint()}</p>
			<p class="error" id="ds-description-error">{error('description')}</p>
		</div>
		{@render text('docsUrl', m.datasources_docs_url(), source?.docsUrl ?? '', {
			type: 'url',
			inputmode: 'url',
			placeholder: 'https://'
		})}
	</fieldset>

	<fieldset>
		<legend>{m.datasources_section_connection()}</legend>
		{#if isDatabase || type === 'redis'}
			<div class="pair">
				{@render text('host', m.datasources_host(), stored.host ?? '', {
					placeholder: 'db.example.com'
				})}
				{@render text('port', m.datasources_port(), stored.port ?? defaultPort(), {
					inputmode: 'numeric'
				})}
			</div>
		{/if}
		{#if isDatabase}
			<div class="pair">
				{@render text('database', m.datasources_database(), stored.database ?? '', {})}
				{@render text('username', m.datasources_username(), stored.username ?? '', {})}
			</div>
			{@render secret('password', false)}
			<div class="field">
				<label for="ds-ssl">{m.datasources_ssl()}</label>
				<select id="ds-ssl" name="ssl" value={stored.ssl ?? 'disable'}>
					<option value="disable">{m.datasources_ssl_disable()}</option>
					<option value="require">{m.datasources_ssl_require()}</option>
					<option value="verify">{m.datasources_ssl_verify()}</option>
				</select>
				<p class="error"></p>
			</div>
		{:else if type === 'redis'}
			<div class="pair">
				{@render text('username', m.datasources_username(), stored.username ?? '', {
					hint: m.datasources_redis_username_hint()
				})}
				{@render text('database', m.datasources_redis_database(), stored.database ?? 0, {
					inputmode: 'numeric'
				})}
			</div>
			{@render secret('password', false)}
			<label class="check">
				<input type="checkbox" name="tls" checked={stored.tls ?? false} />
				<span>{m.datasources_tls()}</span>
			</label>
		{:else if type === 's3'}
			{@render text('endpoint', m.datasources_endpoint(), stored.endpoint ?? '', {
				type: 'url',
				inputmode: 'url',
				placeholder: 'https://',
				hint: m.datasources_endpoint_hint()
			})}
			<div class="pair">
				{@render text('bucket', m.datasources_bucket(), stored.bucket ?? '', {})}
				{@render text('region', m.datasources_region(), stored.region ?? 'us-east-1', {})}
			</div>
			{@render text(
				'accessKeyId',
				m.datasources_access_key_id(),
				stored.accessKeyId ?? '',
				{}
			)}
			{@render secret('secretAccessKey', false)}
			<label class="check">
				<input type="checkbox" name="pathStyle" checked={stored.pathStyle ?? true} />
				<span>{m.datasources_path_style()}</span>
			</label>
		{:else if type === 'api'}
			{@render text('baseUrl', m.datasources_base_url(), stored.baseUrl ?? '', {
				type: 'url',
				inputmode: 'url',
				placeholder: 'https://api.example.com/v1'
			})}
			{@render text('testPath', m.datasources_test_path(), stored.testPath ?? '', {
				placeholder: '/health',
				hint: m.datasources_test_path_hint()
			})}
			<div class="field">
				<label for="ds-auth">{m.datasources_auth()}</label>
				<select id="ds-auth" name="auth" bind:value={apiAuth}>
					<option value="none">{m.datasources_auth_none()}</option>
					<option value="bearer">{m.datasources_auth_bearer()}</option>
					<option value="header">{m.datasources_auth_header()}</option>
					<option value="basic">{m.datasources_auth_basic()}</option>
				</select>
				<p class="error"></p>
			</div>
			{#if apiAuth === 'header'}
				{@render text('headerName', m.datasources_header_name(), stored.headerName ?? '', {
					placeholder: 'X-Api-Key'
				})}
			{/if}
			{#if apiAuth === 'basic'}
				{@render text('username', m.datasources_username(), stored.username ?? '', {})}
				{@render secret('password', false)}
			{/if}
			{#if apiAuth === 'bearer' || apiAuth === 'header'}
				{@render secret('token', false)}
			{/if}
		{:else}
			{@render text('url', m.datasources_url(), stored.url ?? '', {
				type: 'url',
				inputmode: 'url',
				placeholder: 'https://cdn.example.com/file.json'
			})}
			<div class="field">
				<label for="ds-link-auth">{m.datasources_auth()}</label>
				<select id="ds-link-auth" name="auth" bind:value={linkAuth}>
					<option value="none">{m.datasources_auth_none()}</option>
					<option value="bearer">{m.datasources_auth_bearer()}</option>
				</select>
				<p class="error"></p>
			</div>
			{#if linkAuth === 'bearer'}
				{@render secret('token', false)}
			{/if}
		{/if}
	</fieldset>

	{#if canTunnel}
		<fieldset>
			<legend>{m.datasources_section_ssh()}</legend>
			<label class="check">
				<input type="checkbox" name="ssh.enabled" bind:checked={sshEnabled} />
				<span>{m.datasources_ssh_enabled()}</span>
			</label>
			{#if sshEnabled}
				<div class="pair">
					{@render text('ssh.host', m.datasources_ssh_host(), storedSsh.host, {
						placeholder: 'bastion.example.com'
					})}
					{@render text('ssh.port', m.datasources_port(), storedSsh.port, {
						inputmode: 'numeric'
					})}
				</div>
				{@render text('ssh.username', m.datasources_username(), storedSsh.username, {})}
				<div class="field">
					<span class="label" id="ds-ssh-auth-label">{m.datasources_ssh_auth()}</span>
					<div class="segments" role="radiogroup" aria-labelledby="ds-ssh-auth-label">
						<label class:active={sshAuth === 'password'}>
							<input
								type="radio"
								name="ssh.auth"
								value="password"
								class="visually-hidden"
								bind:group={sshAuth}
							/>
							{m.datasources_ssh_auth_password()}
						</label>
						<label class:active={sshAuth === 'key'}>
							<input
								type="radio"
								name="ssh.auth"
								value="key"
								class="visually-hidden"
								bind:group={sshAuth}
							/>
							{m.datasources_ssh_auth_key()}
						</label>
					</div>
				</div>
				{#if sshAuth === 'password'}
					{@render secret('sshPassword', false)}
				{:else}
					{@render secret('sshPrivateKey', true)}
					{@render secret('sshPassphrase', false)}
				{/if}
				{#if storedSsh.fingerprint !== ''}
					<p class="hint">
						{m.datasources_ssh_fingerprint({ fingerprint: storedSsh.fingerprint })}
					</p>
				{:else}
					<p class="hint">{m.datasources_ssh_fingerprint_hint()}</p>
				{/if}
			{/if}
		</fieldset>
	{/if}

	<div class="actions">
		{#if oncancel !== undefined}
			<button type="button" class="quiet" onclick={oncancel}>{m.common_cancel()}</button>
		{/if}
		<button type="submit" class="primary">
			{source === null ? m.datasources_add() : m.common_save()}
		</button>
	</div>
</form>

<style lang="scss">
	@use '../../../../styles/colors' as clr;
	@use '../../../../styles/forms' as forms;
	@use '../../../../styles/variables' as vars;

	.source-form {
		display: flex;
		flex-direction: column;
		gap: 1.6rem;
	}

	fieldset {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		min-width: 0;
		margin: 0;
		padding: 1.1rem 1.1rem 0.6rem;
		background-color: clr.$surfaceColor;
		border: 1px solid clr.$borderSubtleColor;
		border-radius: vars.$radius;

		> legend {
			@include forms.sigil;
			padding: 0 0.4rem;
		}
	}

	.pair {
		display: grid;
		grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
		gap: 0 1rem;
	}

	.field {
		min-width: 0;

		> label,
		> .label {
			@include forms.fieldLabel;
		}

		> input,
		> textarea {
			@include forms.textInput;
		}

		> select {
			@include forms.inputSurface;
		}

		> textarea {
			resize: vertical;

			&.mono {
				font-family: 'Space Mono', monospace;
				font-size: 0.75rem;
			}
		}

		> .error {
			@include forms.fieldError;
		}
	}

	.hint,
	.hint-row {
		margin-top: 0.35rem;
		font-size: 0.72rem;
		line-height: 1.5;
		color: clr.$textMutedColor;
	}

	.hint-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.3rem 1rem;

		> .hint {
			margin: 0;
		}
	}

	.check {
		display: inline-flex;
		align-items: center;
		gap: 0.55rem;
		min-height: vars.$touchTarget;
		font-size: 0.82rem;
		color: clr.$textSecondaryColor;
		cursor: pointer;

		> input {
			width: 1rem;
			height: 1rem;
			accent-color: clr.$accentColor;
		}

		&.small {
			min-height: 0;
			font-size: 0.72rem;
		}
	}

	.segments {
		@include forms.segmentedControl;
		max-width: 22rem;

		> label {
			@include forms.segmentedOption;

			&.active {
				@include forms.segmentedOptionActive;
			}

			&:focus-within {
				outline: 2px solid clr.$focusRingColor;
				outline-offset: 1px;
			}
		}
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.7rem;

		> .primary {
			@include forms.primaryButton;
		}

		> .quiet {
			@include forms.framedButton;
		}
	}

	@media (max-width: vars.$mobileMax) {
		.pair {
			grid-template-columns: minmax(0, 1fr);
		}

		.actions > button {
			flex: 1;
		}
	}
</style>
