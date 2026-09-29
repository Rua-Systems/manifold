export interface UserAgentSummary {
	browser: string | null;
	os: string | null;
}

// Order matters: Edge and Opera also announce Chrome, and Chrome also announces Safari.
const BROWSERS: [RegExp, string][] = [
	[/Edg(e|A|iOS)?\//, 'Edge'],
	[/OPR\/|Opera/, 'Opera'],
	[/Firefox\/|FxiOS\//, 'Firefox'],
	[/Chrome\/|CriOS\//, 'Chrome'],
	[/Safari\//, 'Safari']
];

const SYSTEMS: [RegExp, string][] = [
	[/Windows/, 'Windows'],
	[/iPhone|iPad|iPod/, 'iOS'],
	[/Android/, 'Android'],
	[/Mac OS X|Macintosh/, 'macOS'],
	[/CrOS/, 'ChromeOS'],
	[/Linux/, 'Linux']
];

function firstMatch(value: string, candidates: [RegExp, string][]): string | null {
	for (const [pattern, name] of candidates) {
		if (pattern.test(value)) {
			return name;
		}
	}
	return null;
}

/** A coarse browser and operating system guess, enough to recognise a device in a list or a mail. */
export function summarizeUserAgent(userAgent: string | null | undefined): UserAgentSummary {
	if (userAgent === null || userAgent === undefined || userAgent.length === 0) {
		return { browser: null, os: null };
	}
	return { browser: firstMatch(userAgent, BROWSERS), os: firstMatch(userAgent, SYSTEMS) };
}
