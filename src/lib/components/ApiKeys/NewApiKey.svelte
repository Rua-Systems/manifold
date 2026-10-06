<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import { getNotifications } from '$lib/state/notifications.svelte';

	interface Props {
		apiKey: string;
		/** A copy was saved in the vault together with the key. */
		savedToVault: boolean;
	}

	let { apiKey, savedToVault }: Props = $props();

	const notifications = getNotifications();

	async function copy(): Promise<void> {
		await navigator.clipboard.writeText(apiKey);
		notifications.confirm(m.api_keys_copied());
	}
</script>

<div class="new-key" role="status">
	<p>{m.api_keys_new_lead()}</p>
	<code>{apiKey}</code>
	{#if savedToVault}
		<p>{m.api_keys_vault_saved()}</p>
	{/if}
	<button type="button" onclick={copy}>{m.api_keys_copy()}</button>
</div>

<style lang="scss">
	@use '../../../styles/colors' as clr;
	@use '../../../styles/forms' as forms;
	@use '../../../styles/variables' as vars;

	.new-key {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		padding: 1rem;
		background-color: clr.$accentWashColor;
		border: 1px solid clr.$accentMutedColor;
		border-radius: vars.$radius;

		> p {
			font-size: 0.82rem;
			color: clr.$textPrimaryColor;
		}

		> code {
			font-size: 0.86rem;
			color: clr.$textPrimaryColor;
			overflow-wrap: anywhere;
		}

		> button {
			@include forms.primaryButton;
			align-self: flex-start;
		}
	}
</style>
