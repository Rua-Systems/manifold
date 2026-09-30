import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { baselineHeaders } from './lib/server/security-headers';

// The production entry, built into build/server.js. adapter-node's own entry hands static files
// (the build's /_app/ assets, the icons) to its file server before the SvelteKit hooks run, so they
// would miss the security headers. This entry sets them on every response first and then passes
// the request to adapter-node's handler, which reads HOST, PORT, ORIGIN, ADDRESS_HEADER and the
// other adapter-node variables as usual.

type RequestHandler = (request: IncomingMessage, response: ServerResponse) => void;

const UNSUPPORTED_METHODS = new Set(['TRACE', 'TRACK', 'CONNECT']);

const host = process.env.HOST ?? '0.0.0.0';
const port = Number(process.env.PORT ?? '3000');
const shutdownTimeoutMs = Number(process.env.SHUTDOWN_TIMEOUT ?? '30') * 1000;
const https = (process.env.ORIGIN ?? '').startsWith('https://');

async function loadHandler(): Promise<RequestHandler> {
	const loaded: unknown = await import(new URL('./handler.js', import.meta.url).href);
	if (
		typeof loaded !== 'object' ||
		loaded === null ||
		!('handler' in loaded) ||
		typeof loaded.handler !== 'function'
	) {
		throw new Error('build/handler.js does not export a request handler.');
	}
	return loaded.handler as RequestHandler;
}

const handler = await loadHandler();
const baseline = baselineHeaders(https);

const server = createServer((request, response) => {
	for (const [name, value] of baseline) {
		response.setHeader(name, value);
	}
	if (request.method !== undefined && UNSUPPORTED_METHODS.has(request.method.toUpperCase())) {
		response.writeHead(405, { Allow: 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS' });
		response.end();
		return;
	}
	handler(request, response);
});

let shuttingDown = false;

function shutDown(): void {
	if (shuttingDown) {
		return;
	}
	shuttingDown = true;
	server.closeIdleConnections();
	server.close();
	setTimeout(() => server.closeAllConnections(), shutdownTimeoutMs).unref();
}

process.on('SIGINT', shutDown);
process.on('SIGTERM', shutDown);

server.listen(port, host, () => {
	console.log(`Listening on http://${host}:${port}`);
});
