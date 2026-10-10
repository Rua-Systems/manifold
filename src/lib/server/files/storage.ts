import { createReadStream, createWriteStream, type ReadStream, type WriteStream } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getEnv } from '../env';

const STORAGE_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function uploadDirectory(): string {
	return path.resolve(getEnv().UPLOAD_DIR);
}

/** Whether a name in the upload folder is one Manifold could have given. */
export function isStorageKey(name: string): boolean {
	return STORAGE_KEY.test(name);
}

/** Storage keys are generated UUIDs; anything else never reaches the file system. */
function pathFor(storageKey: string): string {
	if (!isStorageKey(storageKey)) {
		throw new Error('Refusing an invalid storage key.');
	}
	return path.join(uploadDirectory(), storageKey);
}

export async function writeStoredFile(storageKey: string, bytes: Uint8Array): Promise<void> {
	await mkdir(uploadDirectory(), { recursive: true });
	await writeFile(pathFor(storageKey), bytes, { flag: 'wx' });
}

/** A new stored file to stream into; it fails rather than replace one that exists. */
export async function createStoredFileStream(storageKey: string): Promise<WriteStream> {
	await mkdir(uploadDirectory(), { recursive: true });
	return createWriteStream(pathFor(storageKey), { flags: 'wx' });
}

export async function readStoredFile(storageKey: string): Promise<Buffer> {
	return readFile(pathFor(storageKey));
}

/** The size of a stored file on disk, or null when it is missing. */
export async function storedFileSize(storageKey: string): Promise<number | null> {
	try {
		return (await stat(pathFor(storageKey))).size;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			return null;
		}
		throw error;
	}
}

/** Reads the bytes `start` to `end`, both included. */
export function openStoredFile(storageKey: string, start: number, end: number): ReadStream {
	return createReadStream(pathFor(storageKey), { start, end });
}

export async function removeStoredFile(storageKey: string): Promise<void> {
	await rm(pathFor(storageKey), { force: true });
}
