import { paraglideVitePlugin } from '@inlang/paraglide-js';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
	plugins: [
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
			version: {
				name: packageJson.version
			},
			// hooks.server.ts runs the same origin check for form posts, except under /api/, where
			// only Bearer keys count and API clients send no Origin header with their uploads.
			csrf: {
				checkOrigin: false
			},
			csp: {
				mode: 'auto',
				directives: {
					'default-src': ['self'],
					'script-src': ['self'],
					// Svelte transitions write inline styles.
					'style-src': ['self', 'unsafe-inline'],
					// Tile hosts are configured at runtime, so any https image source is allowed.
					'img-src': ['self', 'data:', 'blob:', 'https:'],
					'connect-src': ['self'],
					'font-src': ['self'],
					'frame-ancestors': ['none'],
					'base-uri': ['self'],
					'form-action': ['self'],
					'object-src': ['none']
				}
			},
			typescript: {
				config: (config) => {
					config.include.push(
						'../drizzle.config.ts',
						'../playwright.config.ts',
						'../vite.cli.config.ts',
						'../scripts/**/*.ts'
					);
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
		projects: [
			{
				extends: true,
				test: {
					name: 'unit',
					environment: 'node',
					include: ['src/**/*.test.ts'],
					exclude: ['src/**/*.int.test.ts']
				}
			},
			{
				extends: true,
				test: {
					name: 'integration',
					environment: 'node',
					include: ['src/**/*.int.test.ts'],
					globalSetup: ['./tests/integration/global-setup.ts'],
					setupFiles: ['./tests/integration/setup.ts'],
					fileParallelism: false,
					testTimeout: 30_000,
					hookTimeout: 60_000
				}
			}
		]
	}
});
