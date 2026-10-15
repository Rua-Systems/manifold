<script lang="ts">
	import { enhance } from '$app/forms';
	import ConfirmDialog from '$lib/components/ConfirmDialog/ConfirmDialog.svelte';
	import PageShell from '$lib/components/PageShell/PageShell.svelte';
	import TagPicker from '$lib/components/Tags/TagPicker.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { getNotifications } from '$lib/state/notifications.svelte';
	import type { Tag } from '$lib/types/tags';
	import type { FieldErrors } from '$lib/types/validation';
	import { localizedHref } from '$lib/utils/navigation';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { untrack } from 'svelte';
	import CategorySelect from '../../components/CategorySelect.svelte';
	import type { MemoryCategory } from '../../types';
	import {
		nameFromTitle,
		PROMPT_BODY_MAX_LENGTH,
		PROMPT_DESCRIPTION_MAX_LENGTH,
		PROMPT_NAME_MAX_LENGTH,
		PROMPT_TITLE_MAX_LENGTH
	} from '../schemas';
	import type { Prompt } from '../types';
	import { fillPrompt, promptVariables } from '../variables';

	/** What the save action answers. */
	interface SaveForm {
		saved?: boolean;
		conflict?: boolean;
		errors?: FieldErrors;
	}

	interface Props {
		/** Null for a prompt not saved yet. */
		prompt: Prompt | null;
		categories: MemoryCategory[];
		tags: Tag[];
		form: SaveForm | null | undefined;
	}

	let { prompt, categories, tags, form }: Props = $props();

	const notifications = getNotifications();
	const initial = untrack(() => prompt);

	let title = $state(initial?.title ?? '');
	let name = $state(initial?.name ?? '');
	/** A new prompt's handle follows its title until the owner writes one. */
	let nameTouched = $state(initial !== null);
	let description = $state(initial?.description ?? '');
	let body = $state(initial?.body ?? '');
	let category = $state(initial?.categoryId ?? '');
	let chosenTags = $state<string[]>(initial?.tags.map((item) => item.id) ?? []);
	let values = $state<Record<string, string>>({});
	let deleteOpen = $state(false);

	const errors = $derived<FieldErrors>(form?.errors ?? {});
	const shownName = $derived.by(() => {
		if (nameTouched) {
			return name;
		}
		return nameFromTitle(title);
	});
	const variables = $derived(promptVariables(body));
	const filled = $derived(
		fillPrompt(
			body,
			Object.fromEntries(
				variables
					.filter((variable) => (values[variable] ?? '') !== '')
					.map((variable) => [variable, values[variable]])
			)
		)
	);
	const pageTitle = $derived(title.trim() || m.prompts_new());

	const save: SubmitFunction = () => {
		return async ({ result, update }) => {
			if (result.type === 'redirect' || result.type === 'success') {
				notifications.confirm(m.prompts_saved());
			}
			if (result.type === 'failure' && result.data?.conflict === true) {
				notifications.fault(m.prompts_conflict());
			}
			await update({ reset: false });
		};
	};

	const deleteResult: SubmitFunction = () => {
		deleteOpen = false;
		return async ({ result, update }) => {
			if (result.type === 'redirect') {
				notifications.confirm(m.prompts_deleted());
			}
			await update();
		};
	};

	async function copy(): Promise<void> {
		try {
			await navigator.clipboard.writeText(filled);
			notifications.confirm(m.prompts_copied());
		} catch {
			notifications.fault(m.prompts_copy_failed());
		}
	}
</script>

<PageShell
	title={pageTitle}
	sigil={m.memory_sigil()}
	metaDescription={m.prompts_meta_description()}
>
	{#snippet actions()}
		<a class="quiet" href={localizedHref('/memory/prompts')}>{m.prompts_all()}</a>
		{#if prompt !== null}
			<button type="button" class="quiet danger" onclick={() => (deleteOpen = true)}>
				{m.common_delete()}
			</button>
		{/if}
	{/snippet}
	<div class="layout">
		<form method="POST" action="?/save" class="prompt" use:enhance={save} novalidate>
			<input type="hidden" name="version" value={prompt?.version ?? 1} />
			<div class="field">
				<label for="promptTitle">{m.prompts_field_title()}</label>
				<input
					id="promptTitle"
					name="title"
					type="text"
					maxlength={PROMPT_TITLE_MAX_LENGTH}
					autocomplete="off"
					aria-invalid={(errors.title ?? '').length > 0}
					aria-describedby="promptTitleError"
					bind:value={title}
				/>
				<p class="error" id="promptTitleError">{errors.title ?? ''}</p>
			</div>
			<div class="field">
				<label for="promptName">{m.prompts_field_name()}</label>
				<input
					id="promptName"
					name="name"
					type="text"
					maxlength={PROMPT_NAME_MAX_LENGTH}
					autocomplete="off"
					spellcheck="false"
					aria-invalid={(errors.name ?? '').length > 0}
					aria-describedby="promptNameHint promptNameError"
					value={shownName}
					oninput={(event) => {
						nameTouched = true;
						name = event.currentTarget.value;
					}}
				/>
				<p class="hint" id="promptNameHint">{m.prompts_name_hint()}</p>
				<p class="error" id="promptNameError">{errors.name ?? ''}</p>
			</div>
			<div class="field">
				<label for="promptDescription">{m.prompts_field_description()}</label>
				<input
					id="promptDescription"
					name="description"
					type="text"
					maxlength={PROMPT_DESCRIPTION_MAX_LENGTH}
					autocomplete="off"
					aria-invalid={(errors.description ?? '').length > 0}
					aria-describedby="promptDescriptionError"
					bind:value={description}
				/>
				<p class="error" id="promptDescriptionError">{errors.description ?? ''}</p>
			</div>
			<div class="field">
				<label for="promptCategory">{m.memory_category()}</label>
				<CategorySelect
					id="promptCategory"
					{categories}
					bind:value={category}
					emptyLabel={m.memory_category_none()}
					describedBy="promptCategoryError"
					invalid={(errors.category ?? '').length > 0}
				/>
				<p class="error" id="promptCategoryError">{errors.category ?? ''}</p>
			</div>
			<TagPicker
				{tags}
				bind:selected={chosenTags}
				legend={m.memory_tags()}
				error={errors.tags ?? ''}
				idPrefix="promptTags"
			/>
			<div class="field">
				<label for="promptBody">{m.prompts_field_body()}</label>
				<textarea
					id="promptBody"
					name="body"
					rows="14"
					maxlength={PROMPT_BODY_MAX_LENGTH}
					spellcheck="false"
					aria-invalid={(errors.body ?? '').length > 0}
					aria-describedby="promptBodyHint promptBodyError"
					bind:value={body}></textarea>
				<p class="hint" id="promptBodyHint">
					{m.prompts_body_hint({ example: '{{topic}}' })}
				</p>
				<p class="error" id="promptBodyError">{errors.body ?? ''}</p>
			</div>
			<div class="submit">
				<button type="submit" class="primary">{m.common_save()}</button>
			</div>
		</form>
		<section class="try" aria-labelledby="promptTryHeading">
			<h2 id="promptTryHeading">{m.prompts_try()}</h2>
			{#if variables.length === 0}
				<p class="hint">{m.prompts_no_variables()}</p>
			{:else}
				{#each variables as variable (variable)}
					<div class="field">
						<label for="promptValue-{variable}"><code>{variable}</code></label>
						<input
							id="promptValue-{variable}"
							type="text"
							autocomplete="off"
							value={values[variable] ?? ''}
							oninput={(event) => {
								values = { ...values, [variable]: event.currentTarget.value };
							}}
						/>
					</div>
				{/each}
			{/if}
			<pre class="filled" aria-label={m.prompts_filled()}>{filled}</pre>
			<button type="button" class="quiet" onclick={copy} disabled={filled.trim() === ''}>
				{m.prompts_copy()}
			</button>
		</section>
	</div>
</PageShell>
{#if prompt !== null}
	<ConfirmDialog
		bind:open={deleteOpen}
		id="promptDelete"
		title={m.prompts_delete_title()}
		message={m.prompts_delete_confirm({ title: prompt.title })}
		action="?/delete"
		fields={{}}
		confirmLabel={m.common_delete()}
		onresult={deleteResult}
	/>
{/if}

<style lang="scss">
	@use '../../../../../styles/colors' as clr;
	@use '../../../../../styles/forms' as forms;
	@use '../../../../../styles/variables' as vars;

	.layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 1.6rem;
		align-items: start;
	}

	@media (min-width: 64rem) {
		.layout {
			grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
		}
	}

	.prompt,
	.try {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		min-width: 0;
	}

	.try {
		padding: 0.9rem 1rem;
		border: 1px solid clr.$borderSubtleColor;
		border-radius: vars.$radius;

		> h2 {
			font-size: 0.7rem;
			letter-spacing: 0.24em;
			text-transform: uppercase;
			color: clr.$accentColor;
		}

		> .quiet {
			align-self: flex-start;
		}
	}

	.field {
		display: flex;
		flex-direction: column;
		min-width: 0;

		> label {
			@include forms.fieldLabel;
		}

		> input,
		> textarea {
			@include forms.textInput;
		}

		> textarea {
			min-height: 14rem;
			font-family: 'Space Mono', monospace;
			font-size: 0.82rem;
			line-height: 1.6;
			resize: vertical;
		}

		> .error {
			@include forms.fieldError;
		}
	}

	.hint {
		margin-top: 0.35rem;
		font-size: 0.7rem;
		line-height: 1.5;
		color: clr.$textMutedColor;
	}

	.filled {
		max-height: 24rem;
		margin: 0;
		padding: 0.7rem 0.8rem;
		overflow: auto;
		font-family: 'Space Mono', monospace;
		font-size: 0.78rem;
		line-height: 1.6;
		color: clr.$textPrimaryColor;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		background-color: clr.$surfaceColor;
		border: 1px solid clr.$borderMutedColor;
		border-radius: vars.$radius;
	}

	.submit {
		display: flex;
		justify-content: flex-end;
	}

	.primary {
		@include forms.primaryButton;
	}

	.quiet {
		@include forms.framedButton;
		display: inline-flex;
		align-items: center;
		text-decoration: none;

		&.danger:hover:not(:disabled) {
			color: clr.$errorColor;
		}
	}

	@media (max-width: vars.$mobileMax) {
		.submit > .primary {
			flex: 1;
		}
	}
</style>
