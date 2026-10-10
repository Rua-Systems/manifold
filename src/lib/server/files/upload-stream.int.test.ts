import { getDb } from '$lib/server/db';
import { file } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { mkdir, readdir } from 'node:fs/promises';
import { beforeEach, describe, expect, it } from 'vitest';
import { serveFile } from './files';
import { readStoredFile, uploadDirectory } from './storage';
import { receiveUploads, UploadFormatError, type ReceiveOptions } from './upload-stream';

const PDF = new TextEncoder().encode('%PDF-1.7 a small document');
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const SAFE_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>';

const ANY: ReceiveOptions = { ownerModule: 'files', maxBytes: 1024, maxFiles: 5, accept: 'any' };

function upload(form: FormData): Request {
	return new Request('http://localhost/upload', { method: 'POST', body: form });
}

async function storedNames(): Promise<string[]> {
	await mkdir(uploadDirectory(), { recursive: true });
	return readdir(uploadDirectory());
}

beforeEach(async () => {
	await getDb().delete(file);
});

describe('receiveUploads', () => {
	it('streams each file to disk with its type, size, hash and the form fields', async () => {
		const form = new FormData();
		form.set('folder', 'f1');
		form.append('file', new File([PDF], 'scan.pdf'));
		form.append('file', new File(['a,b\n1,2'], 'table.csv'));

		const received = await receiveUploads(upload(form), ANY);

		expect(received.fields.get('folder')).toBe('f1');
		expect(received.rejected).toEqual([]);
		expect(received.files.map((item) => [item.originalName, item.mimeType])).toEqual([
			['scan.pdf', 'application/pdf'],
			['table.csv', 'text/csv']
		]);
		const [pdf] = received.files;
		expect(pdf.sizeBytes).toBe(PDF.byteLength);
		expect(pdf.ownerModule).toBe('files');
		expect(pdf.sha256).toBe(createHash('sha256').update(PDF).digest('hex'));
		expect(new Uint8Array(await readStoredFile(pdf.storageKey))).toEqual(PDF);
	});

	it('rejects a file over the limit, an empty one and, for images, anything else', async () => {
		const before = await storedNames();
		const form = new FormData();
		form.append('file', new File([new Uint8Array(2048)], 'big.bin'));
		form.append('file', new File([], 'empty.txt'));
		form.append('file', new File([], ''));

		const received = await receiveUploads(upload(form), ANY);
		expect(received.files).toEqual([]);
		expect(received.rejected).toEqual([
			{ name: 'big.bin', reason: 'too_large' },
			{ name: 'empty.txt', reason: 'empty' }
		]);

		const images = new FormData();
		images.append('file', new File([PDF], 'scan.pdf'));
		images.append('file', new File([PNG], 'dot.png'));
		const onlyImages = await receiveUploads(upload(images), { ...ANY, accept: 'image' });
		expect(onlyImages.rejected).toEqual([{ name: 'scan.pdf', reason: 'unsupported_type' }]);
		expect(onlyImages.files.map((item) => item.mimeType)).toEqual(['image/png']);

		const after = await storedNames();
		expect(after.length).toBe(before.length + 1);
	});

	it('keeps a safe SVG as an image and an unsafe one as a download', async () => {
		const form = new FormData();
		form.append('file', new File([SAFE_SVG], 'icon.svg'));
		form.append('file', new File(['<svg><script>x()</script></svg>'], 'trap.svg'));

		const received = await receiveUploads(upload(form), ANY);
		expect(received.files.map((item) => item.mimeType)).toEqual([
			'image/svg+xml',
			'application/octet-stream'
		]);
	});

	it('refuses a body that is not a whole multipart form and keeps nothing', async () => {
		await expect(
			receiveUploads(
				new Request('http://localhost/upload', { method: 'POST', body: '{"a":1}' }),
				ANY
			)
		).rejects.toThrow(UploadFormatError);

		const before = await storedNames();
		const boundary = 'cutboundary';
		const cut = [
			`--${boundary}`,
			'Content-Disposition: form-data; name="file"; filename="cut.txt"',
			'Content-Type: text/plain',
			'',
			'the body ends before its closing boundary'
		].join('\r\n');
		await expect(
			receiveUploads(
				new Request('http://localhost/upload', {
					method: 'POST',
					headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
					body: cut
				}),
				ANY
			)
		).rejects.toThrow(UploadFormatError);
		expect(await storedNames()).toEqual(before);
		expect(await getDb().select().from(file)).toEqual([]);
	});
});

describe('serveFile', () => {
	it('answers HEAD with the headers alone and a range with its part', async () => {
		const form = new FormData();
		form.append('file', new File(['0123456789'], 'digits.txt'));
		const [stored] = (await receiveUploads(upload(form), ANY)).files;

		const head = await serveFile(stored, new Request('http://localhost/f', { method: 'HEAD' }));
		expect(head?.status).toBe(200);
		expect(head?.headers.get('content-length')).toBe('10');
		expect(head?.body).toBeNull();

		const part = await serveFile(
			stored,
			new Request('http://localhost/f', { headers: { range: 'bytes=7-' } })
		);
		expect(part?.status).toBe(206);
		expect(await part?.text()).toBe('789');

		await getDb()
			.update(file)
			.set({ storageKey: crypto.randomUUID() })
			.where(eq(file.id, stored.id));
		const [moved] = await getDb().select().from(file).where(eq(file.id, stored.id));
		expect(await serveFile(moved, new Request('http://localhost/f'))).toBeNull();
	});
});
