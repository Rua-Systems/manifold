/** One kind of record: how many there are and the space their data takes. */
export interface UsageItem {
	/** Stable across versions, such as `notes.trash`. */
	id: string;
	label: string;
	count: number;
	/** The stored size of the rows, compressed values as stored, without indexes. */
	bytes: number;
}

/** The records of one module, or of the system around them. */
export interface UsageGroup {
	id: string;
	label: string;
	items: UsageItem[];
}

/** The uploaded files of one owner: a module, or the API before anything refers to them. */
export interface FileUsage {
	owner: string;
	label: string;
	count: number;
	bytes: number;
}

export interface TableUsage {
	name: string;
	/** The statistics' count of live rows, which may trail the last writes slightly. */
	rows: number;
	/** Rows, indexes and out-of-line storage together. */
	bytes: number;
}

export interface DatabaseUsage {
	bytes: number;
	tables: TableUsage[];
}

export interface StorageUsage {
	/** The files in UPLOAD_DIR, counted on disk. */
	uploadFiles: number;
	uploadBytes: number;
	/** The file system that holds UPLOAD_DIR; null when it cannot be read. */
	diskBytes: number | null;
	diskFreeBytes: number | null;
}

export interface ProcessUsage {
	version: string;
	nodeVersion: string;
	startedAt: Date;
	uptimeSeconds: number;
	/** Memory the process holds, and the JavaScript heap within it. */
	rssBytes: number;
	heapUsedBytes: number;
	heapTotalBytes: number;
	/** Processor time since the start, user and system together. */
	cpuSeconds: number;
}

/** What the app keeps and the resources it uses, as measured at one moment. */
export interface UsageReport {
	measuredAt: Date;
	content: UsageGroup[];
	files: FileUsage[];
	database: DatabaseUsage;
	storage: StorageUsage;
	process: ProcessUsage;
}
