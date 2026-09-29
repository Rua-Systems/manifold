<script lang="ts">
	import PageShell from '$lib/components/PageShell/PageShell.svelte';
	import AuditLog from '$lib/components/Security/AuditLog.svelte';
	import SessionList from '$lib/components/Security/SessionList.svelte';
	import TwoFactorPanel from '$lib/components/Security/TwoFactorPanel.svelte';
	import SettingsNav from '$lib/components/SettingsNav/SettingsNav.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<PageShell
	title={m.security_title()}
	sigil={m.account_sigil()}
	metaDescription={m.security_meta_description()}
>
	<SettingsNav />
	<section class="section" aria-labelledby="twoFactorHeading">
		<h2 id="twoFactorHeading">{m.security_two_factor()}</h2>
		<TwoFactorPanel enabled={data.twoFactorEnabled} {form} />
	</section>
	<section class="section" aria-labelledby="sessionsHeading">
		<h2 id="sessionsHeading">{m.security_sessions()}</h2>
		<SessionList sessions={data.sessions} />
	</section>
	<section class="section wide" aria-labelledby="auditHeading">
		<h2 id="auditHeading">{m.security_audit()}</h2>
		<AuditLog {...data.audit} />
	</section>
</PageShell>

<style lang="scss">
	@use '../../../../styles/colors' as clr;

	.section {
		display: flex;
		flex-direction: column;
		gap: 1.2rem;
		max-width: 36rem;
		margin-bottom: 2.6rem;

		&.wide {
			max-width: none;
		}

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
	}
</style>
