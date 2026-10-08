<script lang="ts">
	import { enhance } from '$app/forms';
	import Dialog from '$lib/components/Dialog/Dialog.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import type { SubmitFunction } from '@sveltejs/kit';

	interface Props {
		open: boolean;
		id: string;
		title: string;
		message: string;
		/** The form action that carries out the confirmed step, e.g. `?/delete`. */
		action: string;
		fields: Record<string, string>;
		confirmLabel: string;
		onresult?: SubmitFunction;
	}

	let {
		open = $bindable(false),
		id,
		title,
		message,
		action,
		fields,
		confirmLabel,
		onresult
	}: Props = $props();
</script>

<Dialog bind:open {id} {title}>
	<form method="POST" {action} use:enhance={onresult} class="confirm">
		{#each Object.entries(fields) as [name, value] (name)}
			<input type="hidden" {name} {value} />
		{/each}
		<p class="message">{message}</p>
		<div class="actions">
			<button type="button" class="cancel" onclick={() => (open = false)}>
				{m.common_cancel()}
			</button>
			<button type="submit" class="danger">{confirmLabel}</button>
		</div>
	</form>
</Dialog>

<style lang="scss">
	@use '../../../styles/colors' as clr;
	@use '../../../styles/forms' as forms;

	.confirm {
		display: flex;
		flex-direction: column;
		gap: 1.4rem;

		> .message {
			font-size: 0.88rem;
			color: clr.$textSecondaryColor;
			overflow-wrap: anywhere;
		}
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.8rem;

		> .cancel {
			@include forms.primaryButton;
		}

		> .danger {
			@include forms.primaryButton;
			color: clr.$errorColor;
			border-color: clr.$errorColor;

			&:hover:not(:disabled) {
				color: clr.$textPrimaryColor;
				border-color: clr.$errorColor;
				background-color: clr.$errorColor;
				background-image: none;
			}
		}
	}
</style>
