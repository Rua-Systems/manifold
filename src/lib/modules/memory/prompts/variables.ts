// The `{{name}}` places of a prompt: what is filled in each time the prompt is used. A name starts
// with a letter or an underscore and goes on with letters, digits and underscores, so it can also
// be the name of an MCP prompt argument. Spaces inside the braces are allowed: `{{ topic }}`.

const PLACE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]{0,39})\s*\}\}/g;

/** At most this many different places in one prompt. */
export const PROMPT_VARIABLES_MAX = 20;

/** The names of the places in a prompt, once each, in the order they first appear. */
export function promptVariables(body: string): string[] {
	const names: string[] = [];
	for (const match of body.matchAll(PLACE)) {
		if (!names.includes(match[1])) {
			names.push(match[1]);
		}
	}
	return names;
}

/** The prompt with its places filled; a place without a value stays as it is written. */
export function fillPrompt(body: string, values: Record<string, string | undefined>): string {
	return body.replace(PLACE, (place: string, name: string) => {
		const value = values[name];
		if (value === undefined) {
			return place;
		}
		return value;
	});
}
