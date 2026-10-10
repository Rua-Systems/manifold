<script lang="ts">
	import { enhance } from '$app/forms';
	import { m } from '$lib/paraglide/messages.js';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { untrack } from 'svelte';
	import type { FolderSummary } from '../types';

	interface Props {
		/** `?/moveFile` or `?/moveFolder`. */
		action: string;
		fields: Record<string, string>;
		folders: FolderSummary[];
		/** Where the item is now, null for the top. */
		current: string | null;
		/** A folder being moved: it and the folders below it are not offered. */
		moving: string | null;
		serverMessage: string;
		onsaved: (message: string) => void;
	}

	let { action, fields, folders, current, moving, serverMessage, onsaved }: Props = $props();

	let target = $state(untrack(() => current ?? ''));
	let submitted = $state(false);

	/** The folders inside each folder, by its id; `''` holds those at the top. */
	const children = $derived.by(() => {
		const byParent: Record<string, FolderSummary[]> = {};
		for (const folder of folders) {
			const key = folder.parentId ?? '';
			byParent[key] = [...(byParent[key] ?? []), folder];
		}
		return byParent;
	});

	const notice = $derived.by(() => {
		if (!submitted) {
			return '';
		}
		return serverMessage;
	});

	const submit: SubmitFunction = () => {
		submitted = false;
		return async ({ result, update }) => {
			submitted = true;
			if (result.type === 'success' && typeof result.data?.message === 'string') {
				onsaved(result.data.message);
			}
			await update({ reset: false });
		};
	};
</script>

{#snippet branch(parent: string, depth: number)}
	{#each children[parent] ?? [] as folder (folder.id)}
		{#if folder.id !== moving}
			<li>
				<label class="option" style:padding-left="{0.6 + depth * 1.1}rem">
					<input type="radio" name="target" value={folder.id} bind:group={target} />
					<span>{folder.name}</span>
				</label>
				<ul>
					{@render branch(folder.id, depth + 1)}
				</ul>
			</li>
		{/if}
	{/each}
{/snippet}

<form method="POST" {action} use:enhance={submit}>
	{#each Object.entries(fields) as [name, value] (name)}
		<input type="hidden" {name} {value} />
	{/each}
	<fieldset>
		<legend>{m.files_move_to()}</legend>
		<ul class="tree">
			<li>
				<label class="option">
					<input type="radio" name="target" value="" bind:group={target} />
					<span>{m.files_title()}</span>
				</label>
				<ul>
					{@render branch('', 1)}
				</ul>
			</li>
		</ul>
	</fieldset>
	<div class="submit">
		<p class="notice" role="alert">{notice}</p>
		<button type="submit" disabled={target === (current ?? '')}>{m.files_move()}</button>
	</div>
</form>

<style lang="scss">
	@use '../../../../styles/colors' as clr;
	@use '../../../../styles/forms' as forms;
	@use '../../../../styles/variables' as vars;

	form {
		display: flex;
		flex-direction: column;
		gap: 1.1rem;
	}

	fieldset {
		min-width: 0;
		margin: 0;
		padding: 0;
		border: 0;

		> legend {
			@include forms.fieldLabel;
		}
	}

	.tree,
	.tree ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.tree {
		max-height: 18rem;
		overflow-y: auto;
		border: 1px solid clr.$borderSubtleColor;
		border-radius: vars.$radius;
	}

	.option {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		min-height: vars.$touchTarget;
		padding-right: 0.6rem;
		padding-left: 0.6rem;
		font-size: 0.86rem;
		color: clr.$textPrimaryColor;
		cursor: pointer;

		&:hover {
			background-color: clr.$surfaceHoverColor;
		}

		> input {
			flex: none;
			width: 1rem;
			height: 1rem;
			accent-color: clr.$accentColor;
		}

		> span {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
	}

	.submit {
		@include forms.submitGroup;

		> button {
			@include forms.primaryButton;
			align-self: flex-end;
		}
	}

	.notice {
		@include forms.formNotice;
	}

	@media (max-width: vars.$mobileMax) {
		.submit > button {
			align-self: stretch;
		}
	}
</style>
