import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Builds scripts/cli.ts into one self-contained file for the production image (`node cli.js`).
export default defineConfig({
	resolve: {
		alias: {
			$lib: fileURLToPath(new URL('./src/lib', import.meta.url))
		}
	},
	ssr: {
		noExternal: true
	},
	build: {
		ssr: 'scripts/cli.ts',
		outDir: 'build-cli',
		emptyOutDir: true,
		target: 'node24',
		minify: false,
		rolldownOptions: {
			output: {
				entryFileNames: 'cli.js'
			}
		}
	}
});
