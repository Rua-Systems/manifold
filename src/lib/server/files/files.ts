import { isUuid } from '$lib/utils/uuid';
import { and, eq, lt, sql, type SQL } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import { getDb } from '../db';
import { file } from '../db/schema';
import { getEnv } from '../env';
import { detectImageType } from './detect';
import { readStoredFile, removeStoredFile, writeStoredFile } from './storage';
import { logSecurityEvent } from '../log';

const ORPHAN_AGE_MS = 24 * 60 * 60 * 1000;
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

function isPrintable(character: string): boolean {
	const code = character.codePointAt(0) ?? 0;
	return code >= 0x20 && code !== 0x7f;
}

/** Keeps the display name only: no directories, no control characters, a bounded length. */
function cleanName(name: string): string {
	const base = name.split(/[\\/]/).pop() ?? '';
	const trimmed = Array.from(base).filter(isPrintable).join('').trim();
	if (trimmed.length === 0) {
		return 'file';
	}
	return trimmed.slice(0, MAX_NAME_LENGTH);
}

/** Validates an upload by its content, stores it under a generated key and records it. */
export async function storeUpload(upload: File, options: UploadOptions): Promise<StoredFile> {
	if (upload.size === 0) {
		throw new FileRejectedError('empty');
	}
	if (upload.size > getEnv().UPLOAD_MAX_BYTES) {
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
export function contentDisposition(name: string): string {
	const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
	return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/**
 * Serves stored bytes so they can never run as a document: exact type, no sniffing, a sandboxing
 * CSP, and an inline disposition. SVG is only ever shown through <img>, where scripts do not run.
 */
export function fileResponse(stored: StoredFile, bytes: Uint8Array): Response {
	return new Response(new Uint8Array(bytes), {
		headers: {
			'Content-Type': stored.mimeType,
			'Content-Length': String(bytes.byteLength),
			'X-Content-Type-Options': 'nosniff',
			'Content-Security-Policy':
				"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; sandbox",
			'Cache-Control': 'private, max-age=31536000, immutable',
			'Content-Disposition': contentDisposition(stored.originalName)
		}
	});
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
