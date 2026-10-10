import { m } from '$lib/paraglide/messages.js';
import { formatMegabytes } from '$lib/utils/format';
import type { FileRejection } from './files';

export interface RejectionContext {
	/** Service icons may be SVG; other images may not. */
	allowSvg: boolean;
	/** The limit the file went over. */
	maxBytes: number;
}

export function fileRejectionMessage(reason: FileRejection, context: RejectionContext): string {
	switch (reason) {
		case 'empty':
			return m.validation_file_empty();
		case 'too_large':
			return m.validation_file_too_large({ max: formatMegabytes(context.maxBytes) });
		case 'unsupported_type':
			if (context.allowSvg) {
				return m.validation_file_type_icon();
			}
			return m.validation_file_type_image();
	}
}
