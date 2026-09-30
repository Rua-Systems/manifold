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
