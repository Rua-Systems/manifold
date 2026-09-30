<script lang="ts">
	import { page } from '$app/state';
	import { m } from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import type { ActorType } from '$lib/server/actor';
	import type { AuditEventView } from '$lib/types/security';
	import { localizedHref } from '$lib/utils/navigation';
	import { summarizeUserAgent } from '$lib/utils/user-agent';

	interface Props {
		events: AuditEventView[];
		total: number;
		page: number;
		pageSize: number;
		filter: { actor: string; action: string; from: string; to: string };
	}

	let { events, total, page: current, pageSize, filter }: Props = $props();

	const ACTOR_LABELS: Record<ActorType, () => string> = {
		owner: m.security_actor_owner,
		api_key: m.security_actor_api_key,
		cli: m.security_actor_cli,
		system: m.security_actor_system
	};

	const pages = $derived(Math.max(1, Math.ceil(total / pageSize)));

	/** Dates in UTC, like the filter, so a row and the range it falls in agree. */
	const timeFormat = $derived(
		new Intl.DateTimeFormat(getLocale(), {
			dateStyle: 'medium',
			timeStyle: 'medium',
			timeZone: 'UTC'
		})
	);

	/** The current filters with another page, as a query string. */
	function pageQuery(target: number): string {
		const entries = [...page.url.searchParams.entries()].filter(([key]) => key !== 'page');
		entries.push(['page', String(target)]);
		return entries
			.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
			.join('&');
	}

	function device(userAgent: string | null): string {
		const { browser, os } = summarizeUserAgent(userAgent);
		return [browser, os].filter((part) => part !== null).join(', ');
	}

	function details(event: AuditEventView): string {
		const parts = Object.entries(event.metadata).map(
			([key, value]) => `${key}: ${String(value)}`
		);
		if (event.targetType !== null) {
			parts.unshift(`${event.targetType}: ${event.targetId ?? ''}`);
		}
		return parts.join(' · ');
	}
</script>

<form method="GET" class="filters" data-sveltekit-keepfocus data-sveltekit-noscroll>
	<div class="field">
		<label for="auditActor">{m.security_audit_actor()}</label>
		<select id="auditActor" name="actor" value={filter.actor}>
			<option value="">{m.security_audit_any()}</option>
			{#each Object.entries(ACTOR_LABELS) as [value, label] (value)}
				<option {value}>{label()}</option>
			{/each}
		</select>
	</div>
	<div class="field">
		<label for="auditAction">{m.security_audit_action()}</label>
		<input
			id="auditAction"
			name="action"
			type="search"
			autocomplete="off"
			placeholder="auth."
			value={filter.action}
		/>
	</div>
	<div class="field">
		<label for="auditFrom">{m.security_audit_from()}</label>
		<input id="auditFrom" name="from" type="date" value={filter.from} />
	</div>
	<div class="field">
		<label for="auditTo">{m.security_audit_to()}</label>
		<input id="auditTo" name="to" type="date" value={filter.to} />
	</div>
	<button type="submit">{m.security_audit_filter()}</button>
</form>

{#if events.length === 0}
	<p class="empty">{m.security_audit_empty()}</p>
{:else}
	<table class="log">
		<caption class="visually-hidden">{m.security_audit()}</caption>
		<thead>
			<tr>
				<th scope="col">{m.security_audit_time()}</th>
				<th scope="col">{m.security_audit_actor()}</th>
				<th scope="col">{m.security_audit_action()}</th>
				<th scope="col">{m.security_audit_details()}</th>
				<th scope="col">{m.security_audit_origin()}</th>
			</tr>
		</thead>
		<tbody>
			{#each events as event (event.id)}
				<tr>
					<td data-label={m.security_audit_time()}>
						<time datetime={event.occurredAt.toISOString()}>
							{timeFormat.format(event.occurredAt)} UTC
						</time>
					</td>
					<td data-label={m.security_audit_actor()}>{ACTOR_LABELS[event.actorType]()}</td>
					<td data-label={m.security_audit_action()}><code>{event.action}</code></td>
					<td data-label={m.security_audit_details()}>{details(event)}</td>
					<td data-label={m.security_audit_origin()}>
						{[event.ip, device(event.userAgent)].filter(Boolean).join(' · ')}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
	<nav class="pager" aria-label={m.security_audit_pages()}>
		{#if current > 1}
			<a
				href={localizedHref(`/settings/security?${pageQuery(current - 1)}`)}
				data-sveltekit-noscroll>{m.security_audit_newer()}</a
			>
		{/if}
		<p>{m.security_audit_page({ page: current, pages })}</p>
		{#if current < pages}
			<a
				href={localizedHref(`/settings/security?${pageQuery(current + 1)}`)}
				data-sveltekit-noscroll>{m.security_audit_older()}</a
			>
		{/if}
	</nav>
{/if}

<style lang="scss">
	@use '../../../styles/colors' as clr;
	@use '../../../styles/forms' as forms;
	@use '../../../styles/variables' as vars;

	.filters {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
		align-items: end;
		gap: 0.8rem;
		margin-bottom: 1.2rem;

		> button {
			@include forms.primaryButton;
		}
	}

	.field {
		> label {
			@include forms.fieldLabel;
		}

		> input,
		> select {
			@include forms.inputSurface;
			min-height: vars.$touchTarget;
		}
	}

	.empty {
		font-size: 0.86rem;
		color: clr.$textMutedColor;
	}

	.log {
		width: 100%;
		font-size: 0.78rem;
		border-collapse: collapse;

		> thead > tr > th {
			padding: 0.5rem 0.6rem;
			font-size: 0.64rem;
			font-weight: 400;
			letter-spacing: 0.16em;
			text-align: left;
			text-transform: uppercase;
			color: clr.$textMutedColor;
			border-bottom: 1px solid clr.$borderMutedColor;
		}

		> tbody > tr > td {
			padding: 0.5rem 0.6rem;
			text-align: left;
			vertical-align: top;
			color: clr.$textSecondaryColor;
			overflow-wrap: anywhere;
			border-bottom: 1px solid clr.$borderMutedColor;

			> code {
				color: clr.$textPrimaryColor;
			}
		}
	}

	.pager {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1.2rem;
		margin-top: 1rem;

		> a {
			@include forms.mutedLink;
		}

		> p {
			font-size: 0.72rem;
			color: clr.$textMutedColor;
		}
	}

	// Phones: every event becomes a card, each value under its column's name.
	@media (max-width: vars.$mobileMax) {
		.log {
			> thead {
				display: none;
			}

			> tbody > tr {
				display: block;
				padding: 0.5rem 0;
				border-bottom: 1px solid clr.$borderSubtleColor;

				> td {
					display: grid;
					grid-template-columns: 6.5rem 1fr;
					gap: 0.6rem;
					padding: 0.2rem 0;
					border: 0;

					&::before {
						content: attr(data-label);
						font-size: 0.62rem;
						letter-spacing: 0.14em;
						text-transform: uppercase;
						color: clr.$textMutedColor;
					}
				}
			}
		}
	}
</style>
