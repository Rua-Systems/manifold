<script lang="ts">
	import { page } from '$app/state';
	import type { PathnameWithSearchOrHash } from '$app/types';
	import { m } from '$lib/paraglide/messages.js';
	import { deLocalizeHref, getLocale, locales, type Locale } from '$lib/paraglide/runtime.js';
	import { localizedHref } from '$lib/utils/navigation';

	const LABELS: Record<Locale, () => string> = {
		en: m.locale_name_en,
		tr: m.locale_name_tr
	};

	const currentLocale = getLocale();

	// The current URL always belongs to a route of this app once the locale prefix is removed.
	const path = $derived(
		(deLocalizeHref(page.url.pathname) + page.url.search) as PathnameWithSearchOrHash
	);
</script>

<div class="switch">
	<p class="label" id="localeSwitchLabel">{m.language_label()}</p>
	<div class="options" role="group" aria-labelledby="localeSwitchLabel">
		{#each locales as locale (locale)}
			<!-- Messages render once per page, so switching locale needs a full reload. -->
			<a
				href={localizedHref(path, locale)}
				hreflang={locale}
				lang={locale}
				aria-current={locale === currentLocale ? 'true' : undefined}
				data-sveltekit-reload
			>
				{LABELS[locale]()}
			</a>
		{/each}
	</div>
</div>

<style lang="scss">
	@use '../../../styles/forms' as forms;

	.switch {
		> .label {
			@include forms.fieldLabel;
		}

		> .options {
			@include forms.segmentedControl;

			> a {
				@include forms.segmentedOption;

				&[aria-current='true'] {
					@include forms.segmentedOptionActive;
				}
			}
		}
	}
</style>
