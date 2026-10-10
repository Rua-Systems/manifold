import { describe, expect, it } from 'vitest';
import { detectFileType, detectImageType, isSvgDocument, startsLikeSvg } from './detect';

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

	it('accepts plain drawings and refuses SVG that runs, embeds or reaches out', () => {
		const options = { allowSvg: true };
		const svg = (body: string) =>
			text(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${body}</svg>`);

		expect(
			detectImageType(
				svg('<defs><linearGradient id="g"/></defs><rect fill="url(#g)"/>'),
				options
			)
		).toBe('image/svg+xml');
		expect(detectImageType(svg('<use href="#g"/>'), options)).toBe('image/svg+xml');

		expect(detectImageType(svg('<script>alert(1)</script>'), options)).toBeNull();
		expect(detectImageType(svg('<foreignObject><div/></foreignObject>'), options)).toBeNull();
		expect(detectImageType(svg('<rect onload="alert(1)"/>'), options)).toBeNull();
		expect(
			detectImageType(svg('<image href="https://evil.example/x.png"/>'), options)
		).toBeNull();
		expect(detectImageType(svg('<a xlink:href="javascript:alert(1)"/>'), options)).toBeNull();
		expect(
			detectImageType(svg('<rect style="fill:url(https://evil.example/f)"/>'), options)
		).toBeNull();
		expect(
			detectImageType(text('<!DOCTYPE svg [<!ENTITY x "y">]><svg></svg>'), options)
		).toBeNull();
		expect(
			detectImageType(bytes(0x3c, 0x73, 0x76, 0x67, 0x3e, 0xff, 0xfe), options)
		).toBeNull();
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

const ascii = (value: string) => Array.from(value, (character) => character.charCodeAt(0));
const ftyp = (brand: string) => bytes(0, 0, 0, 24, ...ascii('ftyp'), ...ascii(brand), 0, 0, 2, 0);

describe('detectFileType', () => {
	it('recognises images, PDF, audio and video by their signature, whatever the name', () => {
		expect(detectFileType(PNG, 'photo.txt')).toBe('image/png');
		expect(detectFileType(text('%PDF-1.7'), 'scan')).toBe('application/pdf');
		expect(detectFileType(bytes(...ascii('ID3'), 4, 0), 'song.bin')).toBe('audio/mpeg');
		expect(detectFileType(bytes(0xff, 0xfb, 0x90, 0x64), 'frame')).toBe('audio/mpeg');
		expect(detectFileType(bytes(...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WAVEfmt ')), 'a')).toBe(
			'audio/wav'
		);
		expect(detectFileType(bytes(...ascii('OggS'), 0, 2), 'a')).toBe('audio/ogg');
		expect(detectFileType(bytes(...ascii('fLaC'), 0), 'a')).toBe('audio/flac');
		expect(detectFileType(ftyp('M4A '), 'a')).toBe('audio/mp4');
		expect(detectFileType(ftyp('isom'), 'a')).toBe('video/mp4');
		expect(detectFileType(ftyp('qt  '), 'a')).toBe('video/quicktime');
		expect(
			detectFileType(
				bytes(0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x84, ...ascii('webm')),
				'a'
			)
		).toBe('video/webm');
	});

	it('takes text only with a known extension and UTF-8 content', () => {
		expect(detectFileType(text('plain words'), 'read.me.TXT')).toBe('text/plain');
		expect(detectFileType(text('# Title'), 'notes.md')).toBe('text/markdown');
		expect(detectFileType(text('a,b'), 'table.csv')).toBe('text/csv');
		expect(detectFileType(text('{"a":1}'), 'data.json')).toBe('application/json');
		expect(detectFileType(text('çağ ğüş'), 'tr.txt')).toBe('text/plain');

		expect(detectFileType(text('plain words'), 'script.sh')).toBe('application/octet-stream');
		expect(detectFileType(bytes(0x61, 0, 0x62), 'nul.txt')).toBe('application/octet-stream');
		expect(detectFileType(bytes(0xc3, 0x28), 'broken.txt')).toBe('application/octet-stream');
	});

	it('keeps a head cut inside a character as text', () => {
		const word = text('ş');
		expect(detectFileType(word.subarray(0, 1), 'cut.txt')).toBe('text/plain');
	});

	it('stores everything else as a download', () => {
		expect(detectFileType(bytes(0x50, 0x4b, 3, 4), 'archive.zip')).toBe(
			'application/octet-stream'
		);
		expect(detectFileType(text('<html><script>x()</script>'), 'page.html')).toBe(
			'application/octet-stream'
		);
		expect(detectFileType(SVG, 'icon.svg')).toBe('application/octet-stream');
		expect(detectFileType(bytes(), 'empty')).toBe('application/octet-stream');
	});
});

describe('SVG in uploads', () => {
	it('spots an SVG start and checks the whole document', () => {
		expect(startsLikeSvg(SVG)).toBe(true);
		expect(startsLikeSvg(text('<html></html>'))).toBe(false);
		expect(isSvgDocument(SVG)).toBe(true);
		expect(isSvgDocument(text('<svg><script>x()</script></svg>'))).toBe(false);
	});
});
