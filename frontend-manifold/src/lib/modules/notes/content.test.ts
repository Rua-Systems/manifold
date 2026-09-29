import { ValidationError } from '$lib/server/errors';
import { describe, expect, it } from 'vitest';
import { emptyNoteContent, fileIdsInContent, type NoteContent } from './content';
import { contentToText, NOTE_CONTENT_MAX_BYTES, validateNoteContent } from './content.server';
import { markdownToNote, noteToMarkdown } from './markdown.server';

const FILE_ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

function doc(...content: NoteContent[]): NoteContent {
	return { type: 'doc', content };
}

function paragraph(...content: NoteContent[]): NoteContent {
	return { type: 'paragraph', content };
}

function text(value: string, marks?: NoteContent['marks']): NoteContent {
	if (marks === undefined) {
		return { type: 'text', text: value };
	}
	return { type: 'text', text: value, marks };
}

describe('validateNoteContent', () => {
	it('accepts the empty document and returns normalised JSON', () => {
		expect(validateNoteContent(emptyNoteContent())).toEqual(emptyNoteContent());
	});

	it('rejects unknown node and mark types', () => {
		for (const input of [
			doc({ type: 'mermaid', content: [text('graph TD')] }),
			doc(paragraph(text('x', [{ type: 'underline' }]))),
			doc(paragraph(text('x', [{ type: 'highlight' }]))),
			{ type: 'paragraph' },
			'not json',
			null
		]) {
			expect(() => validateNoteContent(input)).toThrow(ValidationError);
		}
	});

	it('rejects a structure the schema does not allow', () => {
		expect(() => validateNoteContent(doc(text('bare text in the document')))).toThrow(
			ValidationError
		);
	});

	it('only allows http, https and mailto links', () => {
		const withLink = (href: string) =>
			doc(paragraph(text('link', [{ type: 'link', attrs: { href } }])));

		for (const href of [
			'https://example.com',
			'http://example.com/a',
			'mailto:a@example.com'
		]) {
			expect(() => validateNoteContent(withLink(href))).not.toThrow();
		}
		for (const href of ['javascript:alert(1)', 'data:text/html,x', '/relative', 'ftp://x']) {
			expect(() => validateNoteContent(withLink(href))).toThrow(ValidationError);
		}
	});

	it('only allows images that are uploaded files', () => {
		const withImage = (src: string) => doc({ type: 'image', attrs: { src } });

		expect(() => validateNoteContent(withImage(`/files/${FILE_ID}`))).not.toThrow();
		for (const src of [
			'https://tracker.example.com/pixel.gif',
			'/files/../etc',
			'data:image/png;base64,AA'
		]) {
			expect(() => validateNoteContent(withImage(src))).toThrow(ValidationError);
		}
	});

	it('enforces the 2 MB limit', () => {
		const big = doc(paragraph(text('x'.repeat(NOTE_CONTENT_MAX_BYTES))));

		expect(() => validateNoteContent(big)).toThrow(ValidationError);
	});
});

describe('content helpers', () => {
	it('derives plain text from the content', () => {
		const content = doc(
			{ type: 'heading', attrs: { level: 1 }, content: [text('Title')] },
			paragraph(text('Body '), text('bold', [{ type: 'bold' }]))
		);

		expect(contentToText(content)).toBe('Title\nBody bold');
	});

	it('finds the uploaded files an image points to', () => {
		const content = doc(
			{ type: 'image', attrs: { src: `/files/${FILE_ID}` } },
			{ type: 'image', attrs: { src: `/files/${FILE_ID.toUpperCase()}` } },
			paragraph(text('no image'))
		);

		expect(fileIdsInContent(content)).toEqual([FILE_ID]);
	});
});

describe('Markdown conversion', () => {
	// Each sample is already in the form the serializer writes, so it must survive both ways.
	const samples: Record<string, string> = {
		headings: '# One\n\n## Two\n\n### Three',
		paragraph: 'Plain text in a paragraph.',
		marks: '**bold** *italic* ~~strike~~ `code`',
		link: '[site](https://example.com) and [mail](mailto:a@example.com)',
		'code block': '```ts\nconst answer = 42;\n```',
		'bullet list': '- one\n- two',
		'ordered list': '1. one\n2. two',
		'task list': '- [ ] open\n- [x] done',
		blockquote: '> quoted',
		'horizontal rule': 'above\n\n---\n\nbelow',
		table: '| a   | b   |\n| --- | --- |\n| 1   | 2   |',
		image: `![](/files/${FILE_ID})`
	};

	for (const [name, markdown] of Object.entries(samples)) {
		it(`round trips ${name}`, () => {
			const json = markdownToNote(markdown);
			const back = noteToMarkdown(json);

			expect(markdownToNote(back)).toEqual(json);
			expect(back.trim()).toBe(markdown);
		});
	}

	it('drops raw HTML', () => {
		const json = markdownToNote(
			'before\n\n<div onclick="x()">block</div>\n\ninline <b>html</b> end'
		);
		const plain = contentToText(json);

		expect(plain).not.toContain('<');
		expect(plain).toContain('before');
		expect(plain).toContain('inline');
	});

	it('rejects Markdown with links or images the notes do not allow', () => {
		expect(() => markdownToNote('[x](javascript:alert(1))')).toThrow(ValidationError);
		expect(() => markdownToNote('![x](https://tracker.example.com/p.gif)')).toThrow(
			ValidationError
		);
	});
});
