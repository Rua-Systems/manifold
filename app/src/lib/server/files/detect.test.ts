import { describe, expect, it } from 'vitest';
import { detectImageType } from './detect';

const bytes = (...values: number[]) => new Uint8Array(values);
const text = (value: string) => new TextEncoder().encode(value);

const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 16);
const GIF = text('GIF89a\u0001\u0000');
const WEBP = bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50);
const SVG = text(
	'<?xml version="1.0"?>\n<!-- icon -->\n<svg xmlns="http://www.w3.org/2000/svg"></svg>'
);

describe('detectImageType', () => {
	it('recognises the allowed raster formats by their signature', () => {
		const options = { allowSvg: false };

		expect(detectImageType(PNG, options)).toBe('image/png');
		expect(detectImageType(JPEG, options)).toBe('image/jpeg');
		expect(detectImageType(GIF, options)).toBe('image/gif');
		expect(detectImageType(WEBP, options)).toBe('image/webp');
	});

	it('accepts SVG only when asked to', () => {
		expect(detectImageType(SVG, { allowSvg: true })).toBe('image/svg+xml');
		expect(detectImageType(SVG, { allowSvg: false })).toBeNull();
	});

	it('rejects files that only claim to be images', () => {
		const options = { allowSvg: true };

		expect(detectImageType(text('#!/bin/sh\necho renamed.png'), options)).toBeNull();
		expect(detectImageType(text('<html><svg></svg></html>'), options)).toBeNull();
		expect(detectImageType(bytes(0x25, 0x50, 0x44, 0x46), options)).toBeNull();
		expect(detectImageType(bytes(), options)).toBeNull();
		expect(
			detectImageType(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x41, 0x56, 0x49), options)
		).toBeNull();
	});
});
