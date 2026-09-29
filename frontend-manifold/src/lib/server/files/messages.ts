import { m } from '$lib/paraglide/messages.js';
import { formatMegabytes } from '$lib/utils/format';
import { getEnv } from '../env';
import type { FileRejection } from './files';

export function fileRejectionMessage(reason: FileRejection, allowSvg: boolean): string {
	switch (reason) {
		case 'empty':
			return m.validation_file_empty();
		case 'too_large':
			return m.validation_file_too_large({ max: formatMegabytes(getEnv().UPLOAD_MAX_BYTES) });
		case 'unsupported_type':
			if (allowSvg) {
				return m.validation_file_type_icon();
			}
			return m.validation_file_type_image();
	}
}
