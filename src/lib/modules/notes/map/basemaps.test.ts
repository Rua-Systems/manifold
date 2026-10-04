import { describe, expect, it } from 'vitest';
import { basemapMaxZoomSchema, basemapUrlSchema, isTileTemplate } from './basemaps';

describe('isTileTemplate', () => {
	it('accepts https XYZ templates with the placeholders OpenLayers fills', () => {
		for (const url of [
			'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
			'https://{a-c}.tile.example.com/{z}/{x}/{y}.png',
			'https://tiles{1-4}.example.com/{z}/{x}/{-y}.jpg',
			'https://api.example.com/tiles/{z}/{x}/{y}?access_token=abc'
		]) {
			expect(isTileTemplate(url), url).toBe(true);
		}
	});

	it('refuses other schemes, missing placeholders, unknown ones and credentials', () => {
		for (const url of [
			'http://tile.example.com/{z}/{x}/{y}.png',
			'https://tile.example.com/{z}/{x}.png',
			'https://tile.example.com/{x}/{y}.png',
			'https://tile.example.com/{z}/{x}/{y}/{style}.png',
			'https://{s}.tile.example.com/{z}/{x}/{y}.png',
			'https://user:secret@tile.example.com/{z}/{x}/{y}.png',
			'javascript:alert(1)//{z}/{x}/{y}',
			'tile.example.com/{z}/{x}/{y}.png'
		]) {
			expect(isTileTemplate(url), url).toBe(false);
		}
	});
});

describe('basemapUrlSchema', () => {
	it("reads Leaflet's {s} as {a-c} and trims the address", () => {
		expect(basemapUrlSchema.parse('  https://{s}.tile.example.com/{z}/{x}/{y}.png ')).toBe(
			'https://{a-c}.tile.example.com/{z}/{x}/{y}.png'
		);
	});
});

describe('basemapMaxZoomSchema', () => {
	it('takes whole numbers from 0 to 22 as text or numbers and refuses blanks', () => {
		expect(basemapMaxZoomSchema.parse('18')).toBe(18);
		expect(basemapMaxZoomSchema.parse(0)).toBe(0);
		for (const value of ['', ' ', null, undefined, '23', -1, 1.5, 'deep']) {
			expect(basemapMaxZoomSchema.safeParse(value).success, String(value)).toBe(false);
		}
	});
});
