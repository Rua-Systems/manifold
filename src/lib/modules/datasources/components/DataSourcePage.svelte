<script lang="ts">
	import { enhance } from '$app/forms';
	import ConfirmDialog from '$lib/components/ConfirmDialog/ConfirmDialog.svelte';
	import PageShell from '$lib/components/PageShell/PageShell.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { getNotifications } from '$lib/state/notifications.svelte';
	import { getStepUp, needsStepUp } from '$lib/state/step-up.svelte';
	import type { FieldErrors } from '$lib/types/validation';
	import { localizedHref } from '$lib/utils/navigation';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import EyeIcon from '@lucide/svelte/icons/eye';
	import EyeOffIcon from '@lucide/svelte/icons/eye-off';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { onDestroy } from 'svelte';
	import { SECRET_LABELS, TYPE_LABELS } from '../labels';
	import type {
		ApiSettings,
		DatabaseSettings,
		DataSourceSecrets,
		DataSourceView,
		LinkSettings,
		RedisSettings,
		S3Settings,
		SecretName,
		SshSettings
	} from '../types';
	import DataSourceForm from './DataSourceForm.svelte';
	import TestStatus from './TestStatus.svelte';
	import TypeIcon from './TypeIcon.svelte';

	interface Props {
		source: DataSourceView;
		/** Field errors of an edit sent without JavaScript. */
		serverErrors: FieldErrors;
	}

	let { source, serverErrors }: Props = $props();

	/** How long revealed secrets stay on screen. */
	const REVEAL_MS = 30_000;
	const MASK = '••••••••';

	const notifications = getNotifications();
	const stepUp = getStepUp();

	let editing = $state(false);
	let testing = $state(false);
	let deleteOpen = $state(false);
	let revealed = $state<{ secrets: DataSourceSecrets; connectionUrl: string | null } | null>(
		null
	);
	// Not state: only the timer that hides revealed secrets again.
	let hideTimer: ReturnType<typeof setTimeout> | undefined;

	onDestroy(() => clearTimeout(hideTimer));

	interface Row {
		label: string;
		value: string;
		mono?: boolean;
	}

	function sslLabel(ssl: DatabaseSettings['ssl']): string {
		if (ssl === 'require') {
			return m.datasources_ssl_require();
		}
		if (ssl === 'verify') {
			return m.datasources_ssl_verify();
		}
		return m.datasources_ssl_disable();
	}

	function authLabel(auth: ApiSettings['auth']): string {
		if (auth === 'bearer') {
			return m.datasources_auth_bearer();
		}
		if (auth === 'header') {
			return m.datasources_auth_header();
		}
		if (auth === 'basic') {
			return m.datasources_auth_basic();
		}
		return m.datasources_auth_none();
	}

	function yesNo(value: boolean): string {
		if (value) {
			return m.datasources_yes();
		}
		return m.datasources_no();
	}

	function sshRows(ssh: SshSettings): Row[] {
		if (!ssh.enabled) {
			return [{ label: m.datasources_section_ssh(), value: m.datasources_ssh_off() }];
		}
		let auth = m.datasources_ssh_auth_password();
		if (ssh.auth === 'key') {
			auth = m.datasources_ssh_auth_key();
		}
		const rows: Row[] = [
			{ label: m.datasources_ssh_host(), value: `${ssh.host}:${ssh.port}`, mono: true },
			{ label: m.datasources_ssh_user(), value: ssh.username, mono: true },
			{ label: m.datasources_ssh_auth(), value: auth }
		];
		if (ssh.fingerprint !== '') {
			rows.push({ label: m.datasources_ssh_host_key(), value: ssh.fingerprint, mono: true });
		}
		return rows;
	}

	/** The settings of the source as labelled rows, without secrets. */
	const rows = $derived.by((): Row[] => {
		if (source.type === 'postgresql' || source.type === 'mysql') {
			const settings = source.settings as DatabaseSettings;
			return [
				{ label: m.datasources_host(), value: settings.host, mono: true },
				{ label: m.datasources_port(), value: String(settings.port), mono: true },
				{ label: m.datasources_database(), value: settings.database || '-', mono: true },
				{ label: m.datasources_username(), value: settings.username, mono: true },
				{ label: m.datasources_ssl(), value: sslLabel(settings.ssl) },
				...sshRows(settings.ssh)
			];
		}
		if (source.type === 'redis') {
			const settings = source.settings as RedisSettings;
			return [
				{ label: m.datasources_host(), value: settings.host, mono: true },
				{ label: m.datasources_port(), value: String(settings.port), mono: true },
				{ label: m.datasources_username(), value: settings.username || '-', mono: true },
				{ label: m.datasources_redis_database(), value: String(settings.database) },
				{ label: m.datasources_tls(), value: yesNo(settings.tls) },
				...sshRows(settings.ssh)
			];
		}
		if (source.type === 's3') {
			const settings = source.settings as S3Settings;
			return [
				{
					label: m.datasources_endpoint(),
					value: settings.endpoint || m.datasources_endpoint_aws(),
					mono: true
				},
				{ label: m.datasources_region(), value: settings.region, mono: true },
				{ label: m.datasources_bucket(), value: settings.bucket, mono: true },
				{ label: m.datasources_access_key_id(), value: settings.accessKeyId, mono: true },
				{ label: m.datasources_path_style(), value: yesNo(settings.pathStyle) }
			];
		}
		if (source.type === 'api') {
			const settings = source.settings as ApiSettings;
			const list: Row[] = [
				{ label: m.datasources_base_url(), value: settings.baseUrl, mono: true },
				{ label: m.datasources_test_path(), value: settings.testPath || '/', mono: true },
				{ label: m.datasources_auth(), value: authLabel(settings.auth) }
			];
			if (settings.auth === 'header') {
				list.push({
					label: m.datasources_header_name(),
					value: settings.headerName,
					mono: true
				});
			}
			if (settings.auth === 'basic') {
				list.push({
					label: m.datasources_username(),
					value: settings.username,
					mono: true
				});
			}
			return list;
		}
		const settings = source.settings as LinkSettings;
		return [
			{ label: m.datasources_url(), value: settings.url, mono: true },
			{ label: m.datasources_auth(), value: authLabel(settings.auth) }
		];
	});

	const hasUrl = $derived(source.type !== 's3');

	function hide(): void {
		clearTimeout(hideTimer);
		revealed = null;
	}

	function secretValue(name: SecretName): string {
		return revealed?.secrets[name] ?? MASK;
	}

	/** Reveal and copy post the same action; the step-up dialog steps in when it is due. */
	const revealSubmit: SubmitFunction = ({ formElement, submitter, formData, cancel }) => {
		const purpose = String(formData.get('purpose'));
		const wanted = String(formData.get('secret'));
		if (purpose === 'reveal' && revealed !== null) {
			cancel();
			hide();
			return;
		}
		return async ({ result }) => {
			if (needsStepUp(result)) {
				if (await stepUp.request()) {
					formElement.requestSubmit(submitter);
				}
				return;
			}
			if (result.type !== 'success' || result.data === undefined) {
				notifications.fault(m.datasources_error_reveal());
				return;
			}
			const data = result.data as {
				secrets: DataSourceSecrets;
				connectionUrl: string | null;
			};
			if (purpose === 'copy') {
				let value = data.connectionUrl ?? '';
				if (wanted !== 'url') {
					value = data.secrets[wanted as SecretName] ?? '';
				}
				await navigator.clipboard.writeText(value);
				notifications.confirm(m.datasources_copied());
				return;
			}
			clearTimeout(hideTimer);
			revealed = data;
			hideTimer = setTimeout(hide, REVEAL_MS);
		};
	};

	const testSubmit: SubmitFunction = () => {
		testing = true;
		return async ({ result, update }) => {
			testing = false;
			if (result.type === 'success' && typeof result.data?.message === 'string') {
				if (result.data.success === true) {
					notifications.confirm(
						m.datasources_test_ok_message({ found: result.data.message })
					);
				} else {
					notifications.fault(
						m.datasources_test_failed_message({ reason: result.data.message })
					);
				}
			}
			await update({ reset: false });
		};
	};

	const deleteResult: SubmitFunction = () => {
		deleteOpen = false;
		return async ({ result, update }) => {
			if (result.type === 'redirect') {
				notifications.confirm(m.datasources_deleted());
			}
			await update();
		};
	};

	function onsaved(message: string): void {
		editing = false;
		hide();
		notifications.confirm(message);
	}
</script>

{#snippet revealForm(secret: string, purpose: 'reveal' | 'copy', label: string)}
	<form method="POST" action="?/reveal" use:enhance={revealSubmit}>
		<input type="hidden" name="purpose" value={purpose} />
		<input type="hidden" name="secret" value={secret} />
		<button type="submit" class="tool" aria-label={label} title={label}>
			{#if purpose === 'copy'}
				<CopyIcon size={16} />
			{:else if revealed === null}
				<EyeIcon size={16} />
			{:else}
				<EyeOffIcon size={16} />
			{/if}
		</button>
	</form>
{/snippet}

<PageShell
	title={source.name}
	sigil={m.datasources_sigil()}
	metaDescription={m.datasources_meta_description()}
>
	{#snippet actions()}
		<a class="quiet-link" href={localizedHref('/data-sources')}>{m.datasources_all()}</a>
		{#if !editing}
			<form method="POST" action="?/test" use:enhance={testSubmit}>
				<button type="submit" class="quiet" disabled={testing}>
					{testing ? m.datasources_testing() : m.datasources_test()}
				</button>
			</form>
			<button type="button" class="quiet" onclick={() => (editing = true)}>
				{m.datasources_edit()}
			</button>
			<button type="button" class="quiet danger" onclick={() => (deleteOpen = true)}>
				{m.common_delete()}
			</button>
		{/if}
	{/snippet}

	{#if editing}
		<DataSourceForm
			type={source.type}
			{source}
			{serverErrors}
			{onsaved}
			oncancel={() => (editing = false)}
		/>
	{:else}
		<div class="layout">
			<section class="card summary" aria-label={m.datasources_section_status()}>
				<span class="box" aria-hidden="true"><TypeIcon type={source.type} size={22} /></span
				>
				<div class="text">
					<span class="kind">{TYPE_LABELS[source.type]()}</span>
					<TestStatus test={source.lastTest} detailed />
				</div>
			</section>

			<section class="card" aria-labelledby="ds-connection">
				<h2 id="ds-connection">{m.datasources_section_connection()}</h2>
				<dl>
					{#each rows as row (row.label)}
						<div>
							<dt>{row.label}</dt>
							<dd class:mono={row.mono === true}>{row.value}</dd>
						</div>
					{/each}
				</dl>
			</section>

			<section class="card" aria-labelledby="ds-secrets">
				<div class="card-head">
					<h2 id="ds-secrets">{m.datasources_section_secrets()}</h2>
					{#if source.secrets.length > 0}
						{@render revealForm(
							'all',
							'reveal',
							revealed === null ? m.datasources_reveal() : m.datasources_hide()
						)}
					{/if}
				</div>
				{#if source.secrets.length === 0}
					<p class="empty">{m.datasources_no_secrets()}</p>
				{:else}
					<ul class="secrets">
						{#each source.secrets as name (name)}
							<li>
								<span class="label">{SECRET_LABELS[name]()}</span>
								<span class="value" class:masked={revealed === null}
									>{secretValue(name)}</span
								>
								{@render revealForm(
									name,
									'copy',
									m.datasources_copy_named({ name: SECRET_LABELS[name]() })
								)}
							</li>
						{/each}
					</ul>
				{/if}
				{#if hasUrl}
					<div class="url">
						<span class="label">{m.datasources_connection_url()}</span>
						<span class="value" class:masked={revealed === null}>
							{revealed?.connectionUrl ?? m.datasources_connection_url_hidden()}
						</span>
						{@render revealForm('url', 'copy', m.datasources_copy_url())}
					</div>
				{/if}
				<p class="hint">{m.datasources_reveal_hint()}</p>
			</section>

			<section class="card" aria-labelledby="ds-notes">
				<h2 id="ds-notes">{m.datasources_section_notes()}</h2>
				{#if source.docsUrl !== null}
					<a
						class="docs"
						href={source.docsUrl}
						target="_blank"
						rel="external noopener noreferrer"
					>
						<ExternalLinkIcon size={14} aria-hidden="true" />
						<span>{m.datasources_open_docs()}</span>
					</a>
				{/if}
				{#if source.description !== ''}
					<p class="description">{source.description}</p>
				{:else if source.docsUrl === null}
					<p class="empty">{m.datasources_no_notes()}</p>
				{/if}
			</section>
		</div>
	{/if}
</PageShell>

<ConfirmDialog
	bind:open={deleteOpen}
	id="dataSourceDelete"
	title={m.datasources_delete_title()}
	message={m.datasources_delete_confirm({ name: source.name })}
	action="?/delete"
	fields={{}}
	confirmLabel={m.common_delete()}
	onresult={deleteResult}
/>

<style lang="scss">
	@use '../../../../styles/colors' as clr;
	@use '../../../../styles/forms' as forms;
	@use '../../../../styles/variables' as vars;

	.quiet {
		@include forms.framedButton;

		&.danger:hover:not(:disabled) {
			color: clr.$errorColor;
			border-color: clr.$errorColor;
		}
	}

	.quiet-link {
		@include forms.mutedLink;
	}

	.layout {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;

		> .summary {
			grid-column: 1 / -1;
		}
	}

	.card {
		min-width: 0;
		padding: 1.1rem 1.2rem;
		background-color: clr.$surfaceColor;
		border: 1px solid clr.$borderSubtleColor;
		border-radius: vars.$radius;

		h2 {
			@include forms.sigil;
			margin: 0 0 0.9rem;
		}
	}

	.card-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.4rem;

		> h2 {
			margin: 0;
		}
	}

	.summary {
		display: flex;
		align-items: flex-start;
		gap: 1rem;

		> .box {
			display: inline-grid;
			flex: none;
			place-items: center;
			width: 2.8rem;
			height: 2.8rem;
			color: clr.$accentColor;
			background-color: clr.$accentWashColor;
			border-radius: vars.$radius;
		}

		> .text {
			display: flex;
			flex-direction: column;
			gap: 0.35rem;
			min-width: 0;

			> .kind {
				font-size: 0.72rem;
				letter-spacing: 0.14em;
				text-transform: uppercase;
				color: clr.$textSecondaryColor;
			}
		}
	}

	dl {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		margin: 0;

		> div {
			display: grid;
			grid-template-columns: minmax(7rem, 2fr) minmax(0, 3fr);
			gap: 0.8rem;
		}

		dt {
			font-size: 0.74rem;
			color: clr.$textMutedColor;
		}

		dd {
			margin: 0;
			font-size: 0.82rem;
			overflow-wrap: anywhere;
			color: clr.$textPrimaryColor;

			&.mono {
				font-family: 'Space Mono', monospace;
				font-size: 0.76rem;
			}
		}
	}

	.secrets {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		margin: 0 0 0.6rem;
		padding: 0;
		list-style: none;
	}

	.secrets > li,
	.url {
		display: grid;
		grid-template-columns: minmax(7rem, 2fr) minmax(0, 3fr) auto;
		align-items: center;
		gap: 0.8rem;

		> .label {
			font-size: 0.74rem;
			color: clr.$textMutedColor;
		}

		> .value {
			font-family: 'Space Mono', monospace;
			font-size: 0.76rem;
			overflow-wrap: anywhere;
			white-space: pre-wrap;
			color: clr.$textPrimaryColor;

			&.masked {
				color: clr.$textMutedColor;
			}
		}
	}

	.url {
		padding-top: 0.6rem;
		border-top: 1px solid clr.$borderSubtleColor;
	}

	.tool {
		@include forms.toolButton;
	}

	.hint,
	.empty {
		margin: 0.6rem 0 0;
		font-size: 0.74rem;
		line-height: 1.5;
		color: clr.$textMutedColor;
	}

	.docs {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		margin-bottom: 0.7rem;
		font-size: 0.82rem;
		color: clr.$accentColor;
		text-decoration: none;

		&:hover {
			text-decoration: underline;
		}
	}

	.description {
		margin: 0;
		font-size: 0.86rem;
		line-height: 1.65;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		color: clr.$textSecondaryColor;
	}

	@media (max-width: vars.$mobileMax) {
		.layout {
			grid-template-columns: minmax(0, 1fr);
		}

		dl > div {
			grid-template-columns: minmax(0, 1fr);
			gap: 0.15rem;
		}

		.secrets > li,
		.url {
			grid-template-columns: minmax(0, 1fr) auto;

			> .label {
				grid-column: 1 / -1;
			}
		}
	}

	@media (pointer: fine) {
		.tool {
			width: 2rem;
			height: 2rem;
		}
	}
</style>
