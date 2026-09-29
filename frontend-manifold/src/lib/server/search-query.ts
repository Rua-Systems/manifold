// Query helpers shared by the search providers. No imports, so any module can use them.

/**
 * A prefix full text query for `to_tsquery`: letters and digits only, so user input cannot carry
 * operators, each word matching words that start with it. Null when nothing is left.
 */
export function prefixQuery(query: string): string | null {
	const words = query
		.toLocaleLowerCase()
		.split(/[^\p{L}\p{N}]+/u)
		.filter((word) => word.length > 0)
		.slice(0, 8);
	if (words.length === 0) {
		return null;
	}
	return words.map((word) => `${word}:*`).join(' & ');
}

/** A LIKE pattern matching `query` anywhere, with `%`, `_` and `\` taken literally. */
export function containsPattern(query: string): string {
	return `%${query.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}
