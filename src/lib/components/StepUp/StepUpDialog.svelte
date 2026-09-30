<script lang="ts">
	import { page } from '$app/state';
	import Dialog from '$lib/components/Dialog/Dialog.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { getStepUp } from '$lib/state/step-up.svelte';
	import { untrack } from 'svelte';
	import StepUpForm from './StepUpForm.svelte';

	const stepUp = getStepUp();

	// Closing the dialog any other way than confirming cancels the action that asked for it.
	$effect(() => {
		if (!stepUp.open) {
			untrack(() => stepUp.finish(false));
		}
	});
</script>

<Dialog bind:open={stepUp.open} id="stepUp" title={m.step_up_title()}>
	<StepUpForm
		id="stepUpDialog"
		twoFactorEnabled={page.data.user?.twoFactorEnabled === true}
		onconfirmed={() => stepUp.finish(true)}
	/>
</Dialog>
