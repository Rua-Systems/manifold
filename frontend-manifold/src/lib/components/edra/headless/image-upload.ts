import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export interface ImageUploadOptions {
	/** Stores the file and resolves to its address, or null when the upload was refused. */
	upload: (file: File) => Promise<string | null>;
}

function imageFiles(list: FileList | null | undefined): File[] {
	return Array.from(list ?? []).filter((file) => file.type.startsWith('image/'));
}

/**
 * Uploads images pasted or dropped into the editor and inserts them where they landed. Edra's
 * media placeholder only uploads from its own dialog, so this covers paste and drop.
 */
export const ImageUpload = Extension.create<ImageUploadOptions>({
	name: 'imageUpload',

	addOptions() {
		return { upload: async () => null };
	},

	addProseMirrorPlugins() {
		const editor = this.editor;
		const { upload } = this.options;

		async function insert(files: File[], position: number | null): Promise<void> {
			for (const file of files) {
				const src = await upload(file);
				if (src === null) {
					continue;
				}
				const chain = editor.chain().focus();
				if (position === null) {
					chain.setImage({ src }).run();
				} else {
					chain.insertContentAt(position, { type: 'image', attrs: { src } }).run();
				}
			}
		}

		return [
			new Plugin({
				key: new PluginKey('imageUpload'),
				props: {
					handlePaste: (_view, event) => {
						const files = imageFiles(event.clipboardData?.files);
						if (files.length === 0) {
							return false;
						}
						void insert(files, null);
						return true;
					},
					handleDrop: (view, event) => {
						const files = imageFiles(event.dataTransfer?.files);
						if (files.length === 0) {
							return false;
						}
						const target = view.posAtCoords({
							left: event.clientX,
							top: event.clientY
						});
						void insert(files, target?.pos ?? null);
						return true;
					}
				}
			})
		];
	}
});
