import { DOWNLOAD_TYPE, isPreviewable } from '$lib/utils/file-kind';
import { isUuid } from '$lib/utils/uuid';
import { and, eq, lt, sql, type SQL } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { getDb } from '../db';
import { file } from '../db/schema';
import { getEnv } from '../env';
import { detectImageType } from './detect';
import { requestedRange } from './range';
import {
	openStoredFile,
	readStoredFile,
	removeStoredFile,
	storedFileSize,
	writeStoredFile
} from './storage';
import { logSecurityEvent } from '../log';

const ORPHAN_AGE_MS = 24 * 60 * 60 * 1000;

/** Images, such as those in notes and service icons, stay small even when uploads may be large. */
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;

/** Files uploaded through the API belong to no module until a note or service refers to them. */
export const API_FILE_OWNER = 'api';
const MAX_NAME_LENGTH = 200;

export interface StoredFile {
	id: string;
	storageKey: string;
	originalName: string;
	mimeType: string;
	sizeBytes: number;
	sha256: string;
	ownerModule: string;
	createdAt: Date;
}

export interface FileReference {
	table: string;
	column: string;
}

export type FileRejection = 'empty' | 'too_large' | 'unsupported_type';

export class FileRejectedError extends Error {
	readonly reason: FileRejection;

	constructor(reason: FileRejection) {
		super(`The upload was rejected: ${reason}.`);
		this.name = 'FileRejectedError';
		this.reason = reason;
		logSecurityEvent('upload_rejected', { reason });
	}
}

export interface UploadOptions {
	ownerModule: string;
	allowSvg?: boolean;
}

/** The largest image accepted: `UPLOAD_MAX_BYTES`, but never more than 10 MB. */
export function imageMaxBytes(): number {
	return Math.min(getEnv().UPLOAD_MAX_BYTES, IMAGE_MAX_BYTES);
}

function isPrintable(character: string): boolean {
	const code = character.codePointAt(0) ?? 0;
	return code >= 0x20 && code !== 0x7f;
}

/** Keeps the display name only: no directories, no control characters, a bounded length. */
export function cleanName(name: string): string {
	const base = name.split(/[\\/]/).pop() ?? '';
	const trimmed = Array.from(base).filter(isPrintable).join('').trim();
	if (trimmed.length === 0) {
		return 'file';
	}
	return trimmed.slice(0, MAX_NAME_LENGTH);
}

/** Validates an image by its content, stores it under a generated key and records it. */
export async function storeUpload(upload: File, options: UploadOptions): Promise<StoredFile> {
	if (upload.size === 0) {
		throw new FileRejectedError('empty');
	}
	if (upload.size > imageMaxBytes()) {
		throw new FileRejectedError('too_large');
	}

	const bytes = new Uint8Array(await upload.arrayBuffer());
	const mimeType = detectImageType(bytes, { allowSvg: options.allowSvg ?? false });
	if (mimeType === null) {
		throw new FileRejectedError('unsupported_type');
	}

	const storageKey = randomUUID();
	await writeStoredFile(storageKey, bytes);
	try {
		const [row] = await getDb()
			.insert(file)
			.values({
				storageKey,
				originalName: cleanName(upload.name),
				mimeType,
				sizeBytes: bytes.byteLength,
				sha256: createHash('sha256').update(bytes).digest('hex'),
				ownerModule: options.ownerModule
			})
			.returning();
		return row;
	} catch (error) {
		await removeStoredFile(storageKey);
		throw error;
	}
}

export async function findFile(id: string): Promise<StoredFile | null> {
	if (!isUuid(id)) {
		return null;
	}
	const [row] = await getDb().select().from(file).where(eq(file.id, id)).limit(1);
	return row ?? null;
}

export async function readFileBytes(stored: StoredFile): Promise<Buffer | null> {
	try {
		return await readStoredFile(stored.storageKey);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			return null;
		}
		throw error;
	}
}

/** `Content-Disposition` with an ASCII fallback and the full name encoded per RFC 5987. */
export function contentDisposition(name: string, disposition: 'inline' | 'attachment'): string {
	const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
	return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/**
 * Serves a stored file so it can never run as a document: exact type, no sniffing and a sandboxing
 * CSP. A file with a preview is shown inline and can be fetched in ranges, which audio and video
 * need to seek; any other file is a download. SVG is only ever shown through <img>, where scripts
 * do not run. Null when the bytes are missing.
 */
export async function serveFile(stored: StoredFile, request: Request): Promise<Response | null> {
	const size = await storedFileSize(stored.storageKey);
	if (size === null) {
		return null;
	}

	let type = stored.mimeType;
	let disposition: 'inline' | 'attachment' = 'inline';
	if (!isPreviewable(stored.mimeType)) {
		type = DOWNLOAD_TYPE;
		disposition = 'attachment';
	}
	const headers: Record<string, string> = {
		'Content-Type': type,
		'X-Content-Type-Options': 'nosniff',
		'Content-Security-Policy':
			"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; sandbox",
		'Cache-Control': 'private, max-age=31536000, immutable',
		'Content-Disposition': contentDisposition(stored.originalName, disposition),
		'Accept-Ranges': 'bytes'
	};

	const range = requestedRange(request.headers.get('range'), size);
	if (range === 'unsatisfiable') {
		headers['Content-Range'] = `bytes */${size}`;
		return new Response(null, { status: 416, headers });
	}
	let start = 0;
	let end = size - 1;
	let status = 200;
	if (range !== null) {
		start = range.start;
		end = range.end;
		status = 206;
		headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
	}
	headers['Content-Length'] = String(end - start + 1);

	// SvelteKit answers HEAD with the GET handler and drops the body, which would leave the file open.
	if (request.method === 'HEAD') {
		return new Response(null, { status, headers });
	}
	const body = Readable.toWeb(openStoredFile(stored.storageKey, start, end)) as ReadableStream;
	return new Response(body, { status, headers });
}

function unreferenced(references: FileReference[]): SQL[] {
	return references.map(
		(reference) =>
			sql`not exists (select 1 from ${sql.identifier(reference.table)} where ${sql.identifier(reference.table)}.${sql.identifier(reference.column)} = ${file.id})`
	);
}

/**
 * Deletes files older than a day that no registered reference points to. Rows go in one
 * statement, so a reference created meanwhile keeps its file; the bytes follow afterwards.
 */
export async function purgeUnreferencedFiles(
	references: FileReference[],
	now: Date
): Promise<number> {
	const cutoff = new Date(now.getTime() - ORPHAN_AGE_MS);
	const deleted = await getDb()
		.delete(file)
		.where(and(lt(file.createdAt, cutoff), ...unreferenced(references)))
		.returning({ storageKey: file.storageKey });

	for (const row of deleted) {
		await removeStoredFile(row.storageKey);
	}
	return deleted.length;
}

/**
 * Deletes one file unless one of `references` points to it, in one statement, so a reference
 * created meanwhile keeps the file. Answers whether it was deleted.
 */
export async function deleteUnreferencedFile(
	id: string,
	references: FileReference[]
): Promise<boolean> {
	const deleted = await getDb()
		.delete(file)
		.where(and(eq(file.id, id), ...unreferenced(references)))
		.returning({ storageKey: file.storageKey });

	for (const row of deleted) {
		await removeStoredFile(row.storageKey);
	}
	return deleted.length > 0;
}

/** Gives a file a new display name, cleaned like the name of an upload. */
export async function renameStoredFile(id: string, name: string): Promise<StoredFile | null> {
	const [row] = await getDb()
		.update(file)
		.set({ originalName: cleanName(name), updatedAt: new Date() })
		.where(eq(file.id, id))
		.returning();
	return row ?? null;
}
