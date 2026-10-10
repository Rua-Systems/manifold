// Byte ranges for audio and video, which browsers fetch in parts to seek. One range per request is
// enough for them; a request for several gets the whole file, which RFC 9110 allows.

export interface ByteRange {
	start: number;
	/** The last byte, included. */
	end: number;
}

const SINGLE_RANGE = /^bytes=(\d*)-(\d*)$/;

/**
 * The part of a file of `size` bytes that a `Range` header asks for: null for the whole file, or
 * `unsatisfiable` for a range that lies outside it.
 */
export function requestedRange(
	header: string | null,
	size: number
): ByteRange | 'unsatisfiable' | null {
	if (header === null) {
		return null;
	}
	const match = SINGLE_RANGE.exec(header.trim());
	if (match === null) {
		return null;
	}
	const [, first, last] = match;
	if (first === '' && last === '') {
		return null;
	}

	if (first === '') {
		// A suffix: the last `last` bytes.
		const length = Number(last);
		if (length === 0) {
			return 'unsatisfiable';
		}
		return { start: Math.max(size - length, 0), end: size - 1 };
	}

	const start = Number(first);
	if (last !== '' && Number(last) < start) {
		// Not a valid range at all, which RFC 9110 says to ignore.
		return null;
	}
	if (start >= size) {
		return 'unsatisfiable';
	}
	let end = size - 1;
	if (last !== '') {
		end = Math.min(Number(last), size - 1);
	}
	return { start, end };
}
