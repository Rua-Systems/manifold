// Svelte 5 bindings for TipTap, from Edra 3.1.3 (MIT, see ../LICENSE). Only the bindings Manifold
// uses are exported; Edra's own node types (mermaid, math, iframe and so on) are not included.
import TiptapRoot from './components/Tiptap.svelte';
import TiptapContent from './components/TiptapContent.svelte';

export { default as EditorContent } from './components/EditorContent.svelte';
export { getEditor } from './components/editorContext.js';
export { default as NodeViewContent } from './components/NodeViewContent.svelte';
export { default as NodeViewWrapper } from './components/NodeViewWrapper.svelte';
export { BubbleMenu } from './components/menus/index.ts';
export { Editor } from './Editor.ts';
export { useEditor } from './hooks/useEditor.svelte.js';
export { useEditorState } from './hooks/useEditorState.svelte.js';
export { useEditorTransaction } from './hooks/useEditorTransaction.svelte.js';
export { SvelteNodeViewRenderer } from './renderers/SvelteNodeViewRenderer.js';

export const Tiptap = Object.assign(TiptapRoot, { Content: TiptapContent });
