import { describe, expect, it } from 'vitest';
import { DOWNLOAD_TYPE, fileKind, isPreviewable } from './file-kind';

describe('fileKind', () => {
	it('names the preview of every stored type', () => {
		expect(fileKind('image/webp')).toBe('image');
		expect(fileKind('image/svg+xml')).toBe('image');
		expect(fileKind('application/pdf')).toBe('pdf');
		expect(fileKind('audio/mpeg')).toBe('audio');
		expect(fileKind('video/webm')).toBe('video');
		expect(fileKind('text/csv')).toBe('text');
		expect(fileKind('application/json')).toBe('text');
	});

	it('treats anything else as a download', () => {
		expect(fileKind(DOWNLOAD_TYPE)).toBe('other');
		expect(fileKind('text/html')).toBe('other');
		expect(isPreviewable('text/html')).toBe(false);
		expect(isPreviewable('image/png')).toBe(true);
	});
});
