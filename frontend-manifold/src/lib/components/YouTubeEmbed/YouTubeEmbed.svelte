<script lang="ts">
	interface Props {
		id: string;
		title: string;
	}

	let { id, title }: Props = $props();

	const source = $derived(`https://www.youtube-nocookie.com/embed/${id}`);
</script>

<div class="embed">
	<iframe
		src={source}
		{title}
		loading="lazy"
		referrerpolicy="strict-origin-when-cross-origin"
		allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
		allowfullscreen
	></iframe>
</div>

<style lang="scss">
	@use '../../../styles/colors' as clr;
	@use '../../../styles/variables' as vars;

	.embed {
		position: relative;
		aspect-ratio: 16 / 9;
		overflow: hidden;
		background-color: clr.$surfaceColor;
		border: 1px solid clr.$borderSubtleColor;
		border-radius: vars.$radius;

		> iframe {
			position: absolute;
			inset: 0;
			width: 100%;
			height: 100%;
			border: 0;
		}
	}
</style>
