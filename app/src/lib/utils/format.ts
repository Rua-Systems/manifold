const MEGABYTE = 1024 * 1024;

/** Bytes as megabytes with at most one decimal, for size limits in messages. */
export function formatMegabytes(bytes: number): string {
	return String(Math.round((bytes / MEGABYTE) * 10) / 10);
}
