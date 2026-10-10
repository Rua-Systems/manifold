import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export interface FileUploadOptions {
	/**
	 * Stores the file and puts it into the document at `position`, or at the cursor for null;
	 * the owner of the editor decides how, such as an image inline or a link to anything else.
	 */
	upload: (file: File, position: number | null) => Promise<void>;
}

function filesOf(list: FileList | null | undefined): File[] {
	return Array.from(list ?? []);
}

/**
 * Uploads files pasted or dropped into the editor and puts them where they landed. Edra's media
 * placeholder only uploads from its own dialog, so this covers paste and drop. The file name keeps
 * its first purpose, images.
 */
export const FileUpload = Extension.create<FileUploadOptions>({
	name: 'fileUpload',

	addOptions() {
		return { upload: async () => {} };
	},

	addProseMirrorPlugins() {
		const { upload } = this.options;

		async function insert(files: File[], position: number | null): Promise<void> {
			for (const file of files) {
				await upload(file, position);
			}
		}

		return [
			new Plugin({
				key: new PluginKey('fileUpload'),
				props: {
					handlePaste: (_view, event) => {
						const files = filesOf(event.clipboardData?.files);
						if (files.length === 0) {
							return false;
						}
						void insert(files, null);
						return true;
					},
					handleDrop: (view, event) => {
						const files = filesOf(event.dataTransfer?.files);
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
