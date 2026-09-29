const ENTITIES: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;'
};

/** Escapes text for HTML content and double or single quoted attributes. */
export function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (character) => ENTITIES[character]);
}
