/** @type {import("prettier").Config} */
const config = {
	useTabs: true,
	tabWidth: 4,
	singleQuote: true,
	trailingComma: 'none',
	printWidth: 100,
	plugins: ['prettier-plugin-svelte'],
	overrides: [
		{ files: '*.svelte', options: { parser: 'svelte' } },
		// YAML cannot hold tabs, and markdownlint refuses them in Markdown.
		{ files: ['*.md', '*.yml', '*.yaml'], options: { useTabs: false, tabWidth: 2 } }
	]
};

export default config;
