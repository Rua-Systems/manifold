import { spawnSync } from 'node:child_process';

// `node scripts/audit.ts`: `npm audit` at the level `high`, except for the advisories accepted
// below. Continuous integration runs it instead of `npm audit --audit-level=high`, which offers no
// way to accept an advisory that has no fixed release yet. Runs directly with Node's type
// stripping, so it may only import Node built-ins.

interface Advisory {
	name: string;
	title: string;
	url: string;
	severity: string;
}

interface Vulnerability {
	isDirect: boolean;
	via: (string | Advisory)[];
	effects: string[];
}

interface AuditReport {
	vulnerabilities?: Record<string, Vulnerability>;
}

interface AcceptedAdvisory {
	id: string;
	packageName: string;
	/** The direct dependencies it may be installed through; any other path fails the audit. */
	onlyThrough: string[];
	reason: string;
}

/** Each entry says why it cannot reach the app. Remove it once a fixed release exists. */
const ACCEPTED: AcceptedAdvisory[] = [
	{
		id: 'GHSA-vfj7-8cjw-p6xm',
		packageName: 'braces',
		onlyThrough: ['markdownlint-cli2'],
		reason: 'no fixed release yet; markdownlint-cli2 only lints the Markdown of this repository and is not part of the image'
	}
];

const BLOCKING_SEVERITIES = new Set(['high', 'critical']);

/** The direct dependencies that install a vulnerable package, following npm's `effects`. */
function directRoots(name: string, report: AuditReport, seen: Set<string>): Set<string> {
	const roots = new Set<string>();
	if (seen.has(name)) {
		return roots;
	}
	seen.add(name);

	const vulnerability = report.vulnerabilities?.[name];
	// A dependent missing from the report is a path the audit cannot follow, so it counts as a root.
	if (vulnerability === undefined || vulnerability.isDirect) {
		roots.add(name);
	}
	for (const dependent of vulnerability?.effects ?? []) {
		for (const root of directRoots(dependent, report, seen)) {
			roots.add(root);
		}
	}
	return roots;
}

function acceptanceOf(advisory: Advisory, report: AuditReport): AcceptedAdvisory | undefined {
	const entry = ACCEPTED.find(
		(accepted) =>
			advisory.name === accepted.packageName && advisory.url.endsWith(`/${accepted.id}`)
	);
	if (entry === undefined) {
		return undefined;
	}
	for (const root of directRoots(advisory.name, report, new Set())) {
		if (!entry.onlyThrough.includes(root)) {
			return undefined;
		}
	}
	return entry;
}

function readReport(): AuditReport {
	// npm is a batch file on Windows, which only a shell can start; the command is a fixed string.
	const result = spawnSync('npm audit --json', {
		encoding: 'utf8',
		shell: true,
		maxBuffer: 64 * 1024 * 1024
	});
	try {
		return JSON.parse(result.stdout) as AuditReport;
	} catch {
		console.error('npm audit returned no report.');
		console.error(result.stderr);
		process.exit(1);
	}
}

const report = readReport();
let blocking = 0;

for (const vulnerability of Object.values(report.vulnerabilities ?? {})) {
	for (const cause of vulnerability.via) {
		if (typeof cause === 'string' || !BLOCKING_SEVERITIES.has(cause.severity)) {
			continue;
		}
		const accepted = acceptanceOf(cause, report);
		if (accepted !== undefined) {
			console.log(
				`Accepted ${cause.name}: ${cause.title} (${cause.url}), ${accepted.reason}.`
			);
			continue;
		}
		console.error(`${cause.severity} ${cause.name}: ${cause.title} (${cause.url})`);
		blocking += 1;
	}
}

if (blocking > 0) {
	console.error(
		`${blocking} advisories of high or critical severity. Run npm audit for details.`
	);
	process.exit(1);
}
console.log('No high or critical advisory outside the accepted ones.');
