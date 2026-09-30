import { createReadStream } from 'node:fs';
import type { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';

// A small ustar writer for backups: regular files only, streamed through gzip. Reading archives
// back uses the `tar` package, which handles every variant; writing only needs this much, and
// lets file names inside the archive differ from their places on disk.

const BLOCK = 512;

export interface TarEntry {
	/** The path inside the archive, forward slashes, at most 255 characters. */
	name: string;
	size: number;
	mtime: Date;
	/** The file to read the content from, or the content itself. */
	source: { path: string } | { bytes: Buffer };
}

function octal(value: number, length: number): string {
	return `${value.toString(8).padStart(length - 1, '0')}\0`;
}

/** Splits a long name into ustar's prefix and name fields. */
function splitName(name: string): { prefix: string; base: string } {
	if (Buffer.byteLength(name) <= 100) {
		return { prefix: '', base: name };
	}
	const slash = name.lastIndexOf('/', 155);
	if (slash <= 0 || Buffer.byteLength(name.slice(slash + 1)) > 100) {
		throw new Error(`The archive path "${name}" is too long.`);
	}
	return { prefix: name.slice(0, slash), base: name.slice(slash + 1) };
}

function header(entry: TarEntry): Buffer {
	const block = Buffer.alloc(BLOCK, 0);
	const { prefix, base } = splitName(entry.name);
	block.write(base, 0, 100, 'utf8');
	block.write(octal(0o644, 8), 100, 8, 'ascii');
	block.write(octal(0, 8), 108, 8, 'ascii');
	block.write(octal(0, 8), 116, 8, 'ascii');
	block.write(octal(entry.size, 12), 124, 12, 'ascii');
	block.write(octal(Math.floor(entry.mtime.getTime() / 1000), 12), 136, 12, 'ascii');
	// The checksum is computed with its own field as spaces.
	block.write(' '.repeat(8), 148, 8, 'ascii');
	block.write('0', 156, 1, 'ascii');
	block.write('ustar\0', 257, 6, 'ascii');
	block.write('00', 263, 2, 'ascii');
	block.write(prefix, 345, 155, 'utf8');
	let sum = 0;
	for (const byte of block) {
		sum += byte;
	}
	block.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
	return block;
}

async function* tarStream(entries: AsyncIterable<TarEntry> | Iterable<TarEntry>) {
	for await (const entry of entries) {
		yield header(entry);
		if ('bytes' in entry.source) {
			yield entry.source.bytes;
		} else {
			let written = 0;
			for await (const chunk of createReadStream(entry.source.path)) {
				written += (chunk as Buffer).length;
				yield chunk as Buffer;
			}
			if (written !== entry.size) {
				throw new Error(`"${entry.name}" changed while it was archived.`);
			}
		}
		const padding = (BLOCK - (entry.size % BLOCK)) % BLOCK;
		if (padding > 0) {
			yield Buffer.alloc(padding, 0);
		}
	}
	// Two empty blocks end the archive.
	yield Buffer.alloc(BLOCK * 2, 0);
}

/** Writes the entries as a gzipped tar archive to `output`. */
export async function writeTarGz(
	entries: AsyncIterable<TarEntry> | Iterable<TarEntry>,
	output: Writable
): Promise<void> {
	await pipeline(tarStream(entries), createGzip(), output);
}
