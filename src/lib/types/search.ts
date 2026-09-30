/** One hit of the search, whichever module found it. */
export interface SearchHit {
	/** The kind of thing: `note`, `service`, `secret`. */
	type: string;
	id: string;
	title: string;
	snippet: string;
	/** An app path, or an outside address when `external` is set. */
	href: string;
	external: boolean;
	/** From 0 to 1; hits of every module are sorted by it together. */
	score: number;
}
