import { DOWNLOAD_TYPE } from '$lib/utils/file-kind';

export type ImageType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' | 'image/svg+xml';

export interface DetectOptions {
	/** SVG is accepted only where it is shown through <img>, such as service icons. */
	allowSvg: boolean;
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const GIF87A = [0x47, 0x49, 0x46, 0x38, 0x37, 0x61];
const GIF89A = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d];
const ID3 = [0x49, 0x44, 0x33];
const WAVE = [0x57, 0x41, 0x56, 0x45];
const OGG = [0x4f, 0x67, 0x67, 0x53];
const FLAC = [0x66, 0x4c, 0x61, 0x43];
const FTYP = [0x66, 0x74, 0x79, 0x70];
const EBML = [0x1a, 0x45, 0xdf, 0xa3];

/** How many first bytes `detectFileType` reads. */
export const DETECT_HEAD_BYTES = 4096;

// Brands of the ISO media container, at byte 8 behind `ftyp`.
const AUDIO_BRANDS = new Set(['M4A ', 'M4B ', 'F4A ']);
const QUICKTIME_BRANDS = new Set(['qt  ']);
const VIDEO_BRANDS = new Set([
	'isom',
	'iso2',
	'iso3',
	'iso4',
	'iso5',
	'iso6',
	'mp41',
	'mp42',
	'avc1',
	'dash',
	'mmp4',
	'MSNV',
	'M4V ',
	'M4VH',
	'M4VP',
	'f4v '
]);

const TEXT_TYPES = new Map([
	['txt', 'text/plain'],
	['log', 'text/plain'],
	['md', 'text/markdown'],
	['markdown', 'text/markdown'],
	['csv', 'text/csv'],
	['json', 'application/json']
]);

const SVG_SNIFF_BYTES = 2048;
// TextDecoder drops a leading byte order mark, so the pattern starts at the first real character.
const SVG_ROOT = /^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*|<!DOCTYPE[^>]*>\s*)*<svg[\s>]/i;

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
	if (bytes.length < offset + signature.length) {
		return false;
	}
	return signature.every((value, index) => bytes[offset + index] === value);
}

// Icons are drawings: nothing that runs, embeds other documents, declares entities or reaches
// another address. Images show SVG without scripts anyway, and /files/<id> answers with a sandbox
// policy; this keeps such content from being stored at all.
const SVG_ACTIVE_ELEMENT = /<\s*(script|foreignObject|iframe|embed|object|handler|audio|video)\b/i;
const SVG_EVENT_ATTRIBUTE = /\son[a-z]+\s*=/i;
const SVG_ENTITY = /<!ENTITY/i;
const SVG_REFERENCE = /(?:href\s*=\s*["']?|url\(\s*["']?)\s*([^"')\s>]*)/gi;

function isLocalReference(target: string): boolean {
	return target.startsWith('#') || /^data:image\/(png|jpeg|gif|webp);/i.test(target);
}

function isSafeSvg(text: string): boolean {
	if (SVG_ACTIVE_ELEMENT.test(text) || SVG_EVENT_ATTRIBUTE.test(text) || SVG_ENTITY.test(text)) {
		return false;
	}
	for (const match of text.matchAll(SVG_REFERENCE)) {
		if (!isLocalReference(match[1])) {
			return false;
		}
	}
	return true;
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
	return String.fromCharCode(...bytes.subarray(start, end));
}

/** An MPEG audio frame starts with eleven set bits; its layer bits are never both zero. */
function isMpegAudioFrame(bytes: Uint8Array): boolean {
	return (
		bytes.length >= 2 &&
		bytes[0] === 0xff &&
		(bytes[1] & 0xe0) === 0xe0 &&
		(bytes[1] & 0x06) !== 0
	);
}

function mediaType(bytes: Uint8Array): string | null {
	if (startsWith(bytes, ID3) || isMpegAudioFrame(bytes)) {
		return 'audio/mpeg';
	}
	if (startsWith(bytes, RIFF) && startsWith(bytes, WAVE, 8)) {
		return 'audio/wav';
	}
	if (startsWith(bytes, OGG)) {
		return 'audio/ogg';
	}
	if (startsWith(bytes, FLAC)) {
		return 'audio/flac';
	}
	if (startsWith(bytes, FTYP, 4) && bytes.length >= 12) {
		const brand = ascii(bytes, 8, 12);
		if (AUDIO_BRANDS.has(brand)) {
			return 'audio/mp4';
		}
		if (QUICKTIME_BRANDS.has(brand)) {
			return 'video/quicktime';
		}
		if (VIDEO_BRANDS.has(brand)) {
			return 'video/mp4';
		}
	}
	// The EBML header names its document type near the start; Matroska files other than WebM stay
	// downloads, since browsers play only some of them.
	if (startsWith(bytes, EBML) && ascii(bytes, 0, 64).includes('webm')) {
		return 'video/webm';
	}
	return null;
}

function extensionOf(name: string): string {
	const dot = name.lastIndexOf('.');
	if (dot <= 0) {
		return '';
	}
	return name.slice(dot + 1).toLowerCase();
}

function isUtf8Text(bytes: Uint8Array): boolean {
	if (bytes.includes(0)) {
		return false;
	}
	try {
		// The head may end inside a character; `stream` keeps that end for a later call.
		new TextDecoder('utf-8', { fatal: true }).decode(bytes, { stream: true });
		return true;
	} catch {
		return false;
	}
}

function looksLikeSvg(bytes: Uint8Array): boolean {
	let text: string;
	try {
		text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch {
		return false;
	}
	return SVG_ROOT.test(text.slice(0, SVG_SNIFF_BYTES)) && isSafeSvg(text);
}

/**
 * Identifies an allowed image from its first bytes. The file name and the type the client claims
 * are never trusted. Returns null for anything else.
 */
export function detectImageType(bytes: Uint8Array, options: DetectOptions): ImageType | null {
	if (startsWith(bytes, PNG)) {
		return 'image/png';
	}
	if (startsWith(bytes, JPEG)) {
		return 'image/jpeg';
	}
	if (startsWith(bytes, GIF87A) || startsWith(bytes, GIF89A)) {
		return 'image/gif';
	}
	if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) {
		return 'image/webp';
	}
	if (options.allowSvg && looksLikeSvg(bytes)) {
		return 'image/svg+xml';
	}
	return null;
}

/**
 * The type a file is stored and served as, from its first bytes. Images, PDF, audio and video are
 * recognised by their signatures, text by its extension together with UTF-8 content. The type the
 * client claims is never trusted; anything else is kept as a download. SVG is left to
 * `isSvgDocument`, which needs the whole file.
 */
export function detectFileType(head: Uint8Array, name: string): string {
	const image = detectImageType(head, { allowSvg: false });
	if (image !== null) {
		return image;
	}
	if (startsWith(head, PDF)) {
		return 'application/pdf';
	}
	const media = mediaType(head);
	if (media !== null) {
		return media;
	}
	const text = TEXT_TYPES.get(extensionOf(name));
	if (text !== undefined && isUtf8Text(head)) {
		return text;
	}
	return DOWNLOAD_TYPE;
}

/** Whether the first bytes open an SVG document, worth reading in full with `isSvgDocument`. */
export function startsLikeSvg(head: Uint8Array): boolean {
	const text = new TextDecoder('utf-8').decode(head, { stream: true });
	return SVG_ROOT.test(text.slice(0, SVG_SNIFF_BYTES));
}

/** Whether a whole file is an SVG drawing with nothing that runs or reaches elsewhere. */
export function isSvgDocument(bytes: Uint8Array): boolean {
	return looksLikeSvg(bytes);
}
