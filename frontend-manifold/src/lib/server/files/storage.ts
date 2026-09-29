import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getEnv } from '../env';

const STORAGE_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function uploadDirectory(): string {
	return path.resolve(getEnv().UPLOAD_DIR);
}

/** Storage keys are generated UUIDs; anything else never reaches the file system. */
function pathFor(storageKey: string): string {
	if (!STORAGE_KEY.test(storageKey)) {
		throw new Error('Refusing an invalid storage key.');
	}
	return path.join(uploadDirectory(), storageKey);
}

export async function writeStoredFile(storageKey: string, bytes: Uint8Array): Promise<void> {
	await mkdir(uploadDirectory(), { recursive: true });
	await writeFile(pathFor(storageKey), bytes, { flag: 'wx' });
}

export async function readStoredFile(storageKey: string): Promise<Buffer> {
	return readFile(pathFor(storageKey));
}

export async function removeStoredFile(storageKey: string): Promise<void> {
	await rm(pathFor(storageKey), { force: true });
}
