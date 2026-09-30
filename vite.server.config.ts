import { defineConfig } from 'vite';

// Builds src/server.ts into build/server.js, next to adapter-node's handler.js, which it loads.
export default defineConfig({
	build: {
		ssr: 'src/server.ts',
		outDir: 'build',
		emptyOutDir: false,
		target: 'node24',
		minify: false,
		rolldownOptions: {
			output: {
				entryFileNames: 'server.js'
			}
		}
	}
});
