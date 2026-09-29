# Edra (headless, trimmed)

The files under `tiptap/` are Edra's Svelte 5 bindings for TipTap, copied from Edra 3.1.3
(`npx edra@latest init headless` copies the same sources) and kept as they are, apart from
formatting and an `untrack` in `Tiptap.svelte` that silences a Svelte warning. `LICENSE` is Edra's
MIT license.

`headless/` holds the parts of Edra's headless UI that Manifold uses (toolbar, bubble menus, code
block view, paste and drop image upload), rewritten against the project's SCSS and messages.
Edra's AI, Mermaid, math, iframe, audio, video, callout, colour, font size, alignment, export,
slash command and drag handle features are left out: notes only allow the content listed in
`src/lib/modules/notes/extensions.ts`.
