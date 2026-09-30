import { getEnv } from './env';

const JSON_BODY_LIMIT = 5 * 1024 * 1024;
// Room for the multipart boundaries and the other form fields next to the file.
const MULTIPART_OVERHEAD = 256 * 1024;

export type BodyCheck = 'ok' | 'too_large' | 'length_required';

/**
 * adapter-node's own limit is lifted (BODY_SIZE_LIMIT=Infinity) and this check applies instead:
 * uploads may be as large as UPLOAD_MAX_BYTES, every other body is capped at 5 MB.
 */
export function checkBodySize(request: Request): BodyCheck {
	if (request.method === 'GET' || request.method === 'HEAD') {
		return 'ok';
	}

	const length = request.headers.get('content-length');
	if (length === null) {
		if (request.headers.get('transfer-encoding') !== null) {
			return 'length_required';
		}
		return 'ok';
	}

	let limit = JSON_BODY_LIMIT;
	if ((request.headers.get('content-type') ?? '').startsWith('multipart/form-data')) {
		limit = getEnv().UPLOAD_MAX_BYTES + MULTIPART_OVERHEAD;
	}
	if (Number(length) > limit) {
		return 'too_large';
	}
	return 'ok';
}
