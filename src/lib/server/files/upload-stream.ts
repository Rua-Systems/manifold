import { DOWNLOAD_TYPE, fileKind } from '$lib/utils/file-kind';
import Busboy, { type BusboyFileStream, type BusboyInstance } from '@fastify/busboy';
import { eq } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import { Readable, Transform, type TransformCallback } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { getDb } from '../db';
import { file } from '../db/schema';
import { logSecurityEvent } from '../log';
import { DETECT_HEAD_BYTES, detectFileType, isSvgDocument, startsLikeSvg } from './detect';
import { cleanName, type FileRejection, type StoredFile } from './files';
import {
	createStoredFileStream,
	ensureUploadDirectory,
	readStoredFile,
	removeStoredFile
} from './storage';

// Uploads are written to disk as they arrive, so a large file never sits in memory whole. The
// multipart body is parsed part by part, and each file is hashed, measured and typed on its way.

/** An SVG file has to be read whole to be checked; a larger one stays a download. */
const SVG_MAX_BYTES = 1024 * 1024;
const FIELD_MAX_BYTES = 4096;
const FIELDS_MAX = 20;

export interface ReceiveOptions {
	ownerModule: string;
	/** The largest file accepted, in bytes. */
	maxBytes: number;
	/** At most this many files in one request; parts beyond it are ignored. */
	maxFiles: number;
	/** `image` refuses all but images (SVG included); `any` keeps every file, unknown ones as downloads. */
	accept: 'image' | 'any';
}

export interface RejectedUpload {
	name: string;
	reason: FileRejection;
}

export interface ReceivedUploads {
	files: StoredFile[];
	/** The text fields of the form by name; a repeated name keeps its last value. */
	fields: Map<string, string>;
	rejected: RejectedUpload[];
}

/** The body is not a multipart form, or it broke off before its end. */
export class UploadFormatError extends Error {
	constructor() {
		super('The upload is not a complete multipart form.');
		this.name = 'UploadFormatError';
	}
}

/** Hashes and measures the bytes passing through, and keeps the first ones for detection. */
class Meter extends Transform {
	readonly hash = createHash('sha256');
	size = 0;
	private readonly headChunks: Buffer[] = [];
	private headSize = 0;

	override _transform(chunk: Buffer, _encoding: BufferEncoding, done: TransformCallback): void {
		this.hash.update(chunk);
		this.size += chunk.byteLength;
		if (this.headSize < DETECT_HEAD_BYTES) {
			this.headChunks.push(chunk);
			this.headSize += chunk.byteLength;
		}
		done(null, chunk);
	}

	head(): Uint8Array {
		return new Uint8Array(Buffer.concat(this.headChunks).subarray(0, DETECT_HEAD_BYTES));
	}
}

type PartResult = { stored: StoredFile } | { rejected: RejectedUpload } | null;

async function storedType(meter: Meter, name: string, storageKey: string): Promise<string> {
	const head = meter.head();
	const detected = detectFileType(head, name);
	if (detected === DOWNLOAD_TYPE && meter.size <= SVG_MAX_BYTES && startsLikeSvg(head)) {
		if (isSvgDocument(await readStoredFile(storageKey))) {
			return 'image/svg+xml';
		}
	}
	return detected;
}

function rejectionOf(
	stream: BusboyFileStream,
	meter: Meter,
	type: string,
	options: ReceiveOptions
): FileRejection | null {
	if (stream.truncated) {
		return 'too_large';
	}
	if (meter.size === 0) {
		return 'empty';
	}
	if (options.accept === 'image' && fileKind(type) !== 'image') {
		return 'unsupported_type';
	}
	return null;
}

async function storePart(
	stream: BusboyFileStream,
	filename: string,
	options: ReceiveOptions
): Promise<PartResult> {
	const storageKey = randomUUID();
	const meter = new Meter();
	try {
		// Piped before the first await: the parser may report an error on the part at once.
		await pipeline(stream, meter, createStoredFileStream(storageKey));
	} catch (error) {
		await removeStoredFile(storageKey);
		throw error;
	}

	// A file input left empty still sends a part, with no name and no bytes.
	if (filename === '' && meter.size === 0) {
		await removeStoredFile(storageKey);
		return null;
	}
	const name = cleanName(filename);
	let type = DOWNLOAD_TYPE;
	if (!stream.truncated && meter.size > 0) {
		type = await storedType(meter, name, storageKey);
	}
	const reason = rejectionOf(stream, meter, type, options);
	if (reason !== null) {
		await removeStoredFile(storageKey);
		logSecurityEvent('upload_rejected', { reason });
		return { rejected: { name, reason } };
	}

	try {
		const [row] = await getDb()
			.insert(file)
			.values({
				storageKey,
				originalName: name,
				mimeType: type,
				sizeBytes: meter.size,
				sha256: meter.hash.digest('hex'),
				ownerModule: options.ownerModule
			})
			.returning();
		return { stored: row };
	} catch (error) {
		await removeStoredFile(storageKey);
		throw error;
	}
}

/** Takes back the files of a request that failed part way, rows and bytes. */
async function discard(results: PromiseSettledResult<PartResult>[]): Promise<void> {
	for (const result of results) {
		if (result.status === 'fulfilled' && result.value !== null && 'stored' in result.value) {
			await getDb().delete(file).where(eq(file.id, result.value.stored.id));
			await removeStoredFile(result.value.stored.storageKey);
		}
	}
}

function createParser(contentType: string, options: ReceiveOptions): BusboyInstance {
	try {
		return Busboy({
			headers: { 'content-type': contentType },
			limits: {
				fileSize: options.maxBytes,
				files: options.maxFiles,
				fields: FIELDS_MAX,
				fieldSize: FIELD_MAX_BYTES,
				parts: options.maxFiles + FIELDS_MAX
			}
		});
	} catch {
		// A multipart type without a boundary, or another type altogether.
		throw new UploadFormatError();
	}
}

/**
 * Streams the files of a multipart request into storage and records them. A file over the limit,
 * an empty one or, for `image`, one that is not an image is rejected and reported; a broken body
 * throws `UploadFormatError` and keeps nothing.
 */
export async function receiveUploads(
	request: Request,
	options: ReceiveOptions
): Promise<ReceivedUploads> {
	const contentType = request.headers.get('content-type') ?? '';
	if (!contentType.toLowerCase().startsWith('multipart/form-data') || request.body === null) {
		throw new UploadFormatError();
	}
	const parser = createParser(contentType, options);

	const fields = new Map<string, string>();
	const parts: Promise<PartResult>[] = [];
	const streams: BusboyFileStream[] = [];
	parser.on('field', (name, value) => {
		fields.set(name, value);
	});
	let storageFailure: unknown = null;
	parser.on('file', (_field, stream, filename: string | undefined) => {
		streams.push(stream);
		// A part with an empty file name arrives without one.
		const part = storePart(stream, filename ?? '', options);
		// A part that cannot be stored stops the whole request instead of leaving it waiting.
		part.catch((error: unknown) => {
			storageFailure ??= error;
			parser.destroy(error as Error);
		});
		parts.push(part);
	});

	await ensureUploadDirectory();
	const body = Readable.fromWeb(request.body as unknown as NodeReadableStream<Uint8Array>);
	try {
		await pipeline(body, parser);
	} catch {
		// Taken before the streams below are closed, whose parts then fail on purpose.
		const cause = storageFailure;
		// The parser does not end the file it was reading; closing it lets that part settle.
		for (const stream of streams) {
			stream.destroy();
		}
		await discard(await Promise.allSettled(parts));
		if (cause !== null) {
			throw cause;
		}
		throw new UploadFormatError();
	}

	const settled = await Promise.allSettled(parts);
	const failure = settled.find((result) => result.status === 'rejected');
	if (failure !== undefined) {
		await discard(settled);
		throw failure.reason;
	}

	const received: ReceivedUploads = { files: [], fields, rejected: [] };
	for (const result of settled) {
		if (result.status !== 'fulfilled' || result.value === null) {
			continue;
		}
		if ('stored' in result.value) {
			received.files.push(result.value.stored);
		} else {
			received.rejected.push(result.value.rejected);
		}
	}
	return received;
}
