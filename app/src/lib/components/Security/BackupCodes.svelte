<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';

	interface Props {
		codes: string[];
	}

	let { codes }: Props = $props();

	const FILE_NAME = 'manifold-backup-codes.txt';

	function download(): void {
		const blob = new Blob([`${codes.join('\n')}\n`], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = FILE_NAME;
		link.click();
		URL.revokeObjectURL(url);
	}
</script>

<div class="codes">
	<p class="lead">{m.security_backup_codes_lead()}</p>
	<ol aria-label={m.security_backup_codes()}>
		{#each codes as code (code)}
			<li><code>{code}</code></li>
		{/each}
	</ol>
	<button type="button" onclick={download}>{m.security_backup_codes_download()}</button>
</div>

<style lang="scss">
	@use '../../../styles/colors' as clr;
	@use '../../../styles/forms' as forms;
	@use '../../../styles/variables' as vars;

	.codes {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1rem;
		background-color: clr.$accentWashColor;
		border: 1px solid clr.$accentMutedColor;
		border-radius: vars.$radius;

		> .lead {
			font-size: 0.82rem;
			color: clr.$textPrimaryColor;
		}

		> ol {
			display: grid;
			grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
			gap: 0.4rem 1rem;
			margin: 0;
			padding: 0;
			list-style: none;

			> li > code {
				font-size: 0.92rem;
				letter-spacing: 0.08em;
				color: clr.$textPrimaryColor;
			}
		}

		> button {
			@include forms.primaryButton;
			align-self: flex-start;
		}
	}
</style>
