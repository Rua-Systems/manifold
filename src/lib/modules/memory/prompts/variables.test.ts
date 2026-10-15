import { describe, expect, it } from 'vitest';
import { fillPrompt, promptVariables } from './variables';

describe('promptVariables', () => {
	it('finds each place once, in order, with or without spaces in the braces', () => {
		expect(promptVariables('Review {{file}} for {{ goal }}; mind {{file}} again.')).toEqual([
			'file',
			'goal'
		]);
		expect(promptVariables('No places, {single} braces, {{ two words }}, {{1st}}.')).toEqual(
			[]
		);
		expect(promptVariables('{{_private}} and {{Name_2}}')).toEqual(['_private', 'Name_2']);
	});
});

describe('fillPrompt', () => {
	it('fills known places everywhere and leaves the others as written', () => {
		expect(
			fillPrompt('Write about {{topic}} in {{ language }}. {{topic}}!', {
				topic: 'tides',
				language: undefined
			})
		).toBe('Write about tides in {{ language }}. tides!');
	});

	it('inserts values as they are, even when they look like places or replacement patterns', () => {
		expect(fillPrompt('{{a}} {{b}}', { a: '{{b}}', b: '$& $1' })).toBe('{{b}} $& $1');
	});
});
