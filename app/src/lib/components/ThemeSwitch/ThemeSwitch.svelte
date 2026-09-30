<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { m } from '$lib/paraglide/messages.js';
	import { getThemeState } from '$lib/state/theme.svelte';
	import type { Theme } from '$lib/types/theme';
	import { localizedHref } from '$lib/utils/navigation';
	import { parseTheme } from '$lib/utils/theme';
	import type { SubmitFunction } from '@sveltejs/kit';

	interface ThemeOption {
		value: Theme;
		label: () => string;
	}

	const OPTIONS: ThemeOption[] = [
		{ value: 'light', label: m.theme_light },
		{ value: 'dark', label: m.theme_dark }
	];

	const theme = getThemeState();

	const returnPath = $derived(page.url.pathname + page.url.search);

	const applyTheme: SubmitFunction = ({ formData }) => {
		const selected = parseTheme(formData.get('theme'));
		if (selected !== null) {
			theme.apply(selected);
		}

		// The response already sets the cookie. Skipping the default update avoids following the
		// redirect, which would re-run every load and close the menu this switch lives in.
		return async () => {};
	};
</script>

<form class="switch" method="POST" action={localizedHref('/theme')} use:enhance={applyTheme}>
	<p class="label" id="themeSwitchLabel">{m.theme_label()}</p>
	<input type="hidden" name="redirectTo" value={returnPath} />
	<div class="options" role="group" aria-labelledby="themeSwitchLabel">
		{#each OPTIONS as option (option.value)}
			<button
				type="submit"
				name="theme"
				value={option.value}
				aria-pressed={theme.current === option.value}
			>
				{option.label()}
			</button>
		{/each}
	</div>
</form>

<style lang="scss">
	@use '../../../styles/forms' as forms;

	.switch {
		> .label {
			@include forms.fieldLabel;
		}

		> .options {
			@include forms.segmentedControl;

			> button {
				@include forms.segmentedOption;

				&[aria-pressed='true'] {
					@include forms.segmentedOptionActive;
				}
			}
		}
	}
</style>
