import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';

// `npm run db:reset`: drops the development database volume and starts a fresh database.
// Runs directly with Node's type stripping, so it may only import Node built-ins.

const COMPOSE = ['compose', '--env-file', '../.env', '-f', '../docker-compose.dev.yml'];
const CONFIRMATION = 'reset';

function docker(args: string[]): void {
	const result = spawnSync('docker', [...COMPOSE, ...args], { stdio: 'inherit' });
	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
}

const prompt = createInterface({ input: process.stdin, output: process.stdout });
const answer = await prompt.question(
	`This deletes the development database and all of its data.\nType "${CONFIRMATION}" to continue: `
);
prompt.close();

if (answer.trim() !== CONFIRMATION) {
	console.log('Cancelled. Nothing was changed.');
	process.exit(1);
}

docker(['down', '--volumes']);
docker(['up', '-d', '--wait']);
console.log('The development database was recreated. The app migrates it on its next start.');
