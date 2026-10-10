<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
	import { onMount } from 'svelte';

	interface Props {
		/** The address of the PDF, fetched by pdf.js in ranges. */
		src: string;
		title: string;
	}

	let { src, title }: Props = $props();

	// A page is drawn when it comes near the screen, so a long document does not draw every page
	// at once.
	const LOOK_AHEAD = '600px';

	let status = $state<'loading' | 'ready' | 'failed'>('loading');
	let pageNumbers = $state<number[]>([]);
	let pdf: PDFDocumentProxy | null = null;
	let task: PDFDocumentLoadingTask | null = null;

	onMount(() => {
		let cancelled = false;
		void (async () => {
			try {
				// Loaded on demand: most pages never show a PDF.
				const pdfjs = await import('pdfjs-dist');
				const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
				if (cancelled) {
					return;
				}
				pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
				// The page fetches what the worker would: the worker runs under a policy that lets
				// it load nothing.
				task = pdfjs.getDocument({ url: src, useWorkerFetch: false });
				const loaded = await task.promise;
				pdf = loaded;
				pageNumbers = Array.from({ length: loaded.numPages }, (_, index) => index + 1);
				status = 'ready';
			} catch {
				status = 'failed';
			}
		})();
		return () => {
			cancelled = true;
			void task?.destroy();
			task = null;
			pdf = null;
		};
	});

	async function draw(canvas: HTMLCanvasElement, pageNumber: number): Promise<void> {
		if (pdf === null) {
			return;
		}
		const page = await pdf.getPage(pageNumber);
		const width = canvas.parentElement?.clientWidth ?? 800;
		const natural = page.getViewport({ scale: 1 });
		const ratio = window.devicePixelRatio || 1;
		const viewport = page.getViewport({ scale: (width / natural.width) * ratio });
		canvas.width = Math.floor(viewport.width);
		canvas.height = Math.floor(viewport.height);
		canvas.style.aspectRatio = `${natural.width} / ${natural.height}`;
		await page.render({ canvas, viewport }).promise;
	}

	function lazyPage(canvas: HTMLCanvasElement, pageNumber: number) {
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					observer.disconnect();
					void draw(canvas, pageNumber);
				}
			},
			{ rootMargin: LOOK_AHEAD }
		);
		observer.observe(canvas);
		return { destroy: () => observer.disconnect() };
	}
</script>

<div class="pdf" aria-label={title} role="document" aria-busy={status === 'loading'}>
	{#if status === 'loading'}
		<p class="state">{m.files_preview_loading()}</p>
	{:else if status === 'failed'}
		<p class="state" role="alert">{m.files_preview_failed()}</p>
	{:else}
		<p class="count">{m.files_pdf_pages({ count: pageNumbers.length })}</p>
		{#each pageNumbers as pageNumber (pageNumber)}
			<div
				class="page"
				role="img"
				aria-label={m.files_pdf_page({ number: pageNumber, count: pageNumbers.length })}
			>
				<canvas use:lazyPage={pageNumber}></canvas>
			</div>
		{/each}
	{/if}
</div>

<style lang="scss">
	@use '../../../../styles/colors' as clr;
	@use '../../../../styles/variables' as vars;

	.pdf {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;

		> .state,
		> .count {
			font-size: 0.8rem;
			color: clr.$textMutedColor;
		}

		// A4 until the page is drawn, so the pages below do not jump. pdf.js paints the page white.
		> .page > canvas {
			display: block;
			width: 100%;
			aspect-ratio: 210 / 297;
			background-color: clr.$surfaceHoverColor;
			border: 1px solid clr.$borderSubtleColor;
			border-radius: vars.$radius;
			box-shadow: 0 6px 18px clr.$shadowColor;
		}
	}
</style>
