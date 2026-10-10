import { describe, expect, it } from 'vitest';
import { detectSeparator, parseCsv } from './csv';

describe('detectSeparator', () => {
	it('takes the separator the first line uses most, outside quotes', () => {
		expect(detectSeparator('a,b,c\n1;2;3;4')).toBe(',');
		expect(detectSeparator('ad;soyad;"a,b,c"\n1,2')).toBe(';');
		expect(detectSeparator('a\tb\tc')).toBe('\t');
		expect(detectSeparator('single')).toBe(',');
	});
});

describe('parseCsv', () => {
	it('reads fields, quotes, doubled quotes and line ends', () => {
		expect(parseCsv('a,b\r\n"x, y","say ""hi"""\n1,', 10)).toEqual([
			['a', 'b'],
			['x, y', 'say "hi"'],
			['1', '']
		]);
	});

	it('keeps line breaks inside quotes and drops a byte order mark', () => {
		expect(parseCsv('\uFEFFnote;size\n"two\nlines";3\n', 10)).toEqual([
			['note', 'size'],
			['two\nlines', '3']
		]);
	});

	it('stops after the given number of rows', () => {
		expect(parseCsv('1\n2\n3\n4', 2)).toEqual([['1'], ['2']]);
		expect(parseCsv('', 5)).toEqual([]);
	});
});
