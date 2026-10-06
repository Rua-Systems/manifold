<script lang="ts">
	import { getLocale } from '$lib/paraglide/runtime.js';
	import type { DashboardLink } from '$lib/types/dashboard';
	import { localizedHref } from '$lib/utils/navigation';
	import { relativeTime } from '$lib/utils/time';
	import type { Pathname } from '$app/types';

	interface Props {
		title: string;
		links: DashboardLink[];
		empty: string;
		/** The moment the dashboard was measured, so the server and the browser say the same. */
		now: Date;
	}

	let { title, links, empty, now }: Props = $props();

	const locale = $derived(getLocale());
</script>

{#snippet content(link: DashboardLink)}
	{#if link.icon?.kind === 'image'}
		<img class="icon" src={link.icon.src} alt="" width="20" height="20" />
	{:else if link.icon?.kind === 'letter'}
		<span class="icon letter" aria-hidden="true">{link.icon.letter}</span>
	{/if}
	<span class="label">{link.label}</span>
	{#if link.code !== undefined}
		<code>{link.code}</code>
	{/if}
	{#if link.time !== undefined}
		<time datetime={link.time.toISOString()}>
			{relativeTime(link.time, locale, now)}
		</time>
	{/if}
{/snippet}

<div class="block">
	<h3>{title}</h3>
	{#if links.length === 0}
		<p class="empty">{empty}</p>
	{:else}
		<ul>
			{#each links as link (link.id)}
				<li>
					{#if link.external}
						<a href={link.href} target="_blank" rel="external noopener noreferrer">
							{@render content(link)}
						</a>
					{:else}
						<a href={localizedHref(link.href as Pathname)}>{@render content(link)}</a>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style lang="scss">
	@use '../../../styles/colors' as clr;
	@use '../../../styles/variables' as vars;

	.block {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;

		> h3 {
			font-size: 0.64rem;
			font-weight: 400;
			letter-spacing: 0.16em;
			text-transform: uppercase;
			color: clr.$textMutedColor;
		}

		> .empty {
			font-size: 0.8rem;
			color: clr.$textMutedColor;
		}

		> ul {
			display: flex;
			flex-direction: column;
			margin: 0;
			padding: 0;
			list-style: none;

			> li > a {
				display: flex;
				align-items: center;
				gap: 0.6rem;
				min-height: vars.$touchTarget;
				padding: 0.25rem 0.4rem;
				font-size: 0.84rem;
				color: clr.$textPrimaryColor;
				text-decoration: none;
				border-radius: vars.$radius;

				&:hover {
					background-color: clr.$surfaceHoverColor;
				}

				> .icon {
					flex: none;
					width: 1.25rem;
					height: 1.25rem;
					object-fit: contain;
				}

				> .letter {
					display: inline-grid;
					place-items: center;
					font-size: 0.7rem;
					color: clr.$textSecondaryColor;
					border: 1px solid clr.$borderSubtleColor;
					border-radius: vars.$radius;
				}

				> .label {
					flex: 1;
					min-width: 0;
					overflow: hidden;
					text-overflow: ellipsis;
					white-space: nowrap;
				}

				> code {
					font-size: 0.72rem;
					color: clr.$textSecondaryColor;
				}

				> time {
					flex: none;
					font-size: 0.7rem;
					color: clr.$textMutedColor;
				}
			}
		}
	}
</style>
