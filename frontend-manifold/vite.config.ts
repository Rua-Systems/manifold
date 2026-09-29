import { paraglideVitePlugin } from '@inlang/paraglide-js';
import adapter from '@sveltejs/adapter-node';
import { enhancedImages } from '@sveltejs/enhanced-img';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		enhancedImages(),
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) => {
					if (filename.split(/[/\\]/).includes('node_modules')) {
						return undefined;
					}
					return true;
				}
			},
			preprocess: vitePreprocess(),
			adapter: adapter(),
			env: {
				dir: '..'
			},
			typescript: {
				config: (config) => {
					config.include.push('../drizzle.config.ts', '../playwright.config.ts');
				}
			}
		}),
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			strategy: ['url', 'baseLocale'],
			trailingSlash: 'never',
			emitTsDeclarations: true
		})
	],
	test: {
		expect: { requireAssertions: true },
		environment: 'node',
		include: ['src/**/*.test.ts']
	}
});
