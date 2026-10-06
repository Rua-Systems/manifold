export interface UsageTableRow {
	id: string;
	label: string;
	count: number;
	bytes: number;
}

/** Rows under an optional heading, such as a module's records. */
export interface UsageTableSection {
	id: string;
	label: string | null;
	rows: UsageTableRow[];
}
