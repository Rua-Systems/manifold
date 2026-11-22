import { paraglideVitePlugin } from '@inlang/paraglide-js';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { readFileSync } from 'node:fs';
import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

/**
 * The app reads its settings from process.env (SvelteKit 3 offers only declared variables through
 * $app/env). The production server gets them from the container; `vite dev` and `vite preview`
 * get the .env file here, without overriding what the shell already set. Vitest also serves, and
 * its tests bring their own environment, so it is left out.
 */
function dotenvForServe(): Plugin {
	return {
		name: 'manifold-dotenv-for-serve',
		config(_config, { command, mode }) {
			if (command !== 'serve' || process.env.VITEST !== undefined) {
				return;
			}
			for (const [name, value] of Object.entries(loadEnv(mode, process.cwd(), ''))) {
				process.env[name] ??= value;
			}
		}
	};
}

export default defineConfig({
	plugins: [
		dotenvForServe(),
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
			// only Bearer keys count and API clients send no Origin header with their uploads. A
			// trusted '*' turns SvelteKit's own check off; `checkOrigin` is deprecated.
			csrf: {
				trustedOrigins: ['*']
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
					'base-uri': ['none'],
					'form-action': ['self'],
					'object-src': ['none']
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
