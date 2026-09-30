import { describe, expect, it } from 'vitest';
import { containsPattern, prefixQuery } from './search-query';

describe('search queries', () => {
	it('turns words into prefix terms and drops operators', () => {
		expect(prefixQuery('Trip plan')).toBe('trip:* & plan:*');
		expect(prefixQuery("ferry & !(hotel) | 'x':*")).toBe('ferry:* & hotel:* & x:*');
		expect(prefixQuery('Şehir çarşı')).toBe('şehir:* & çarşı:*');
		expect(prefixQuery(' !&| ')).toBeNull();
	});

	it('escapes LIKE wildcards', () => {
		expect(containsPattern('100%')).toBe('%100\\%%');
		expect(containsPattern('a_b')).toBe('%a\\_b%');
		expect(containsPattern('back\\slash')).toBe('%back\\\\slash%');
	});
});
