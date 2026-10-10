// A small CSV reader for previews: quoted fields, doubled quotes inside them, CRLF or LF line ends,
// and whichever separator the first line uses most: comma, semicolon (as spreadsheets write it in
// many locales) or tab.

const SEPARATORS = [',', ';', '\t'];

/** The separator the first line uses most outside quotes; a comma when it uses none. */
export function detectSeparator(text: string): string {
	const counts = new Map(SEPARATORS.map((separator) => [separator, 0]));
	let quoted = false;
	for (const character of text) {
		if (character === '"') {
			quoted = !quoted;
		} else if (!quoted && (character === '\n' || character === '\r')) {
			break;
		} else if (!quoted && counts.has(character)) {
			counts.set(character, (counts.get(character) ?? 0) + 1);
		}
	}
	let best = ',';
	let most = 0;
	for (const [separator, count] of counts) {
		if (count > most) {
			best = separator;
			most = count;
		}
	}
	return best;
}

/** The rows of a CSV text, at most `maxRows` of them. */
export function parseCsv(input: string, maxRows: number): string[][] {
	const text = input.replace(/^\uFEFF/, '');
	const separator = detectSeparator(text);
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let quoted = false;

	for (let index = 0; index < text.length && rows.length < maxRows; index += 1) {
		const character = text[index];
		if (quoted) {
			if (character !== '"') {
				field += character;
			} else if (text[index + 1] === '"') {
				field += '"';
				index += 1;
			} else {
				quoted = false;
			}
			continue;
		}
		if (character === '"') {
			quoted = true;
		} else if (character === separator) {
			row.push(field);
			field = '';
		} else if (character === '\n' || character === '\r') {
			if (character === '\r' && text[index + 1] === '\n') {
				index += 1;
			}
			row.push(field);
			rows.push(row);
			row = [];
			field = '';
		} else {
			field += character;
		}
	}

	if ((field !== '' || row.length > 0) && rows.length < maxRows) {
		row.push(field);
		rows.push(row);
	}
	return rows;
}
