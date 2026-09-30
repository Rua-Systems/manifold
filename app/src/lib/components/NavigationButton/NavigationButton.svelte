<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import CloseIcon from '$lib/components/icons/CloseIcon.svelte';
	import UserIcon from '$lib/components/icons/UserIcon.svelte';
	import LocaleSwitch from '$lib/components/LocaleSwitch/LocaleSwitch.svelte';
	import ThemeSwitch from '$lib/components/ThemeSwitch/ThemeSwitch.svelte';
	import { ACCOUNT_LINKS, GUEST_LINKS } from '$lib/config/navigation';
	import { m } from '$lib/paraglide/messages.js';
	import type { NavigationLink } from '$lib/types/navigation';
	import { currentMarker, localizedHref } from '$lib/utils/navigation';
	import type { Action } from 'svelte/action';
	import { cubicOut } from 'svelte/easing';
	import { fade, fly } from 'svelte/transition';

	interface NavigationItem extends NavigationLink {
		current: 'page' | undefined;
	}

	let isOpen = $state(false);
	let triggerElement: HTMLButtonElement | undefined = $state();

	const user = $derived(page.data.user);

	function decorate(links: NavigationLink[]): NavigationItem[] {
		return links.map((link) => ({ ...link, current: currentMarker(page.url, link.href) }));
	}

	const items: NavigationItem[] = $derived.by(() => {
		if (user === null) {
			return decorate(GUEST_LINKS);
		}
		return decorate(ACCOUNT_LINKS);
	});

	afterNavigate(() => {
		isOpen = false;
	});

	$effect(() => {
		if (!isOpen) {
			return;
		}

		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = '';
		};
	});

	const dismissOnClick: Action<HTMLElement> = (node) => {
		function onClick(event: MouseEvent): void {
			const target = event.target;
			if (target instanceof Element && target.closest('a, [data-keep-open]') !== null) {
				return;
			}
			close();
		}

		node.addEventListener('click', onClick);
		return {
			destroy(): void {
				node.removeEventListener('click', onClick);
			}
		};
	};

	function toggle(): void {
		if (isOpen) {
			close();
			return;
		}
		open();
	}

	function open(): void {
		isOpen = true;
	}

	function close(): void {
		isOpen = false;
		triggerElement?.focus();
	}

	function onWindowKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape' && isOpen) {
			close();
		}
	}
</script>

<svelte:window onkeydown={onWindowKeydown} />

<button
	bind:this={triggerElement}
	type="button"
	class="trigger"
	class:open={isOpen}
	aria-label={m.nav_menu()}
	aria-expanded={isOpen}
	aria-controls="mainNavigation"
	onclick={toggle}
>
	<UserIcon />
</button>
{#if isOpen}
	<button
		type="button"
		class="backdrop"
		aria-label={m.nav_close_menu()}
		onclick={close}
		transition:fade={{ duration: 200 }}
	></button>
	<nav
		id="mainNavigation"
		class="panel"
		aria-label={m.nav_label()}
		use:dismissOnClick
		transition:fly={{ x: 340, duration: 340, easing: cubicOut }}
	>
		<div class="panel-header">
			<button type="button" class="close" aria-label={m.nav_close_menu()} onclick={close}>
				<CloseIcon />
			</button>
		</div>
		{#if user !== null}
			<div class="account">
				<p class="name">{user.name}</p>
				<p class="identity">{user.username ?? user.email}</p>
			</div>
		{/if}
		<ul>
			{#each items as item, index (item.href)}
				<li style="--delay: {120 + index * 60}ms">
					<a
						href={localizedHref(item.href)}
						class:active={item.current}
						aria-current={item.current}
					>
						{item.label()}
					</a>
				</li>
			{/each}
		</ul>
		<div class="footer">
			<div class="preferences" data-keep-open>
				<LocaleSwitch />
				<ThemeSwitch />
			</div>
			{#if user !== null}
				<form method="POST" action={localizedHref('/logout')}>
					<button type="submit" class="logout">{m.nav_logout()}</button>
				</form>
			{/if}
		</div>
	</nav>
{/if}

<style lang="scss">
	@use '../../../styles/colors' as clr;
	@use '../../../styles/variables' as vars;

	@keyframes linkIn {
		from {
			opacity: 0;
			transform: translateX(14px);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}

	.trigger {
		position: fixed;
		top: calc(clamp(0.9rem, 2.5vw, 1.5rem) + env(safe-area-inset-top));
		right: calc(clamp(0.9rem, 2.5vw, 1.5rem) + env(safe-area-inset-right));
		z-index: 120;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.75rem;
		height: 2.75rem;
		padding: 0;
		color: clr.$textPrimaryColor;
		background-color: clr.$surfaceTranslucentColor;
		border: 1px solid clr.$accentMutedColor;
		border-radius: vars.$radius;
		backdrop-filter: blur(10px);
		cursor: pointer;
		transition:
			color 160ms ease,
			border-color 160ms ease,
			background-color 160ms ease,
			opacity 180ms ease;

		&:hover {
			color: clr.$accentColor;
			border-color: clr.$accentColor;
			background-color: clr.$accentWashColor;
		}

		&.open {
			opacity: 0;
			pointer-events: none;
		}
	}

	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 100;
		padding: 0;
		background-color: clr.$scrimSoftColor;
		border: 0;
		backdrop-filter: blur(8px);
		cursor: default;
	}

	.panel {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		z-index: 110;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		width: min(20rem, 82vw);
		padding: calc(clamp(0.9rem, 2.5vw, 1.5rem) + env(safe-area-inset-top))
			calc(clamp(0.9rem, 2.5vw, 1.5rem) + env(safe-area-inset-right))
			calc(clamp(0.9rem, 2.5vw, 1.5rem) + env(safe-area-inset-bottom))
			clamp(0.9rem, 2.5vw, 1.5rem);
		overflow-y: auto;
		background-color: clr.$panelColor;
		border-left: 1px solid clr.$borderSubtleColor;
		backdrop-filter: blur(12px);

		> .panel-header {
			display: flex;
			flex: none;
			justify-content: flex-end;
		}

		> .account {
			padding: 0 0.85rem 0.9rem;
			border-bottom: 1px solid clr.$borderMutedColor;

			> .name {
				overflow: hidden;
				font-size: 0.9rem;
				text-overflow: ellipsis;
				white-space: nowrap;
				color: clr.$textPrimaryColor;
			}

			> .identity {
				overflow: hidden;
				font-size: 0.7rem;
				letter-spacing: 0.08em;
				text-overflow: ellipsis;
				white-space: nowrap;
				color: clr.$textMutedColor;
			}
		}

		> .footer {
			display: flex;
			flex-direction: column;
			gap: 1rem;
			margin-top: auto;
			padding-top: 1rem;
			border-top: 1px solid clr.$borderMutedColor;

			> .preferences {
				display: flex;
				flex-direction: column;
				gap: 0.9rem;
				padding-inline: 0.85rem;
			}
		}

		> ul {
			display: flex;
			flex-direction: column;
			gap: 0.2rem;
			margin: 0;
			padding: 0;
			list-style: none;

			> li {
				animation: linkIn 420ms cubic-bezier(0.22, 1, 0.36, 1) both;
				animation-delay: var(--delay);

				> a {
					display: block;
					padding: 0.75rem 0.85rem;
					font-size: 0.95rem;
					letter-spacing: 0.02em;
					text-decoration: none;
					color: clr.$textSecondaryColor;
					border-left: 1px solid transparent;
					border-radius: vars.$radius;
					transition:
						color 160ms ease,
						background-color 160ms ease,
						border-color 160ms ease;

					&:hover {
						color: clr.$textPrimaryColor;
						background-color: clr.$surfaceHoverColor;
					}

					&.active {
						color: clr.$accentColor;
						border-left-color: clr.$accentColor;
						border-radius: 0 vars.$radius vars.$radius 0;
					}
				}
			}
		}
	}

	.close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.75rem;
		height: 2.75rem;
		padding: 0;
		color: clr.$accentColor;
		background-color: transparent;
		border: 1px solid clr.$accentMutedColor;
		border-radius: vars.$radius;
		cursor: pointer;
		transition:
			color 160ms ease,
			border-color 160ms ease,
			background-color 160ms ease;

		&:hover {
			color: clr.$textPrimaryColor;
			border-color: clr.$accentColor;
			background-color: clr.$accentWashColor;
		}
	}

	.logout {
		width: 100%;
		min-height: vars.$touchTarget;
		padding: 0.75rem 0.85rem;
		font-size: 0.7rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		text-align: left;
		color: clr.$textMutedColor;
		background-color: transparent;
		border: 0;
		border-radius: vars.$radius;
		cursor: pointer;
		transition:
			color 160ms ease,
			background-color 160ms ease;

		&:hover {
			color: clr.$errorColor;
			background-color: clr.$surfaceHoverColor;
		}
	}
</style>
