// Just enough of RESP, the Redis protocol, for a connection test: commands go out as arrays of bulk
// strings, and the replies that AUTH, SELECT, PING and INFO answer come back. A driver would be a
// dependency for four commands.

export type RespReply = string | number | null | RespError | RespReply[];

export class RespError {
	constructor(readonly message: string) {}
}

/** A command as RESP: an array of bulk strings. */
export function encodeCommand(args: string[]): Buffer {
	const parts = [`*${args.length}\r\n`];
	for (const arg of args) {
		parts.push(`$${Buffer.byteLength(arg, 'utf8')}\r\n${arg}\r\n`);
	}
	return Buffer.from(parts.join(''), 'utf8');
}

/** One reply from the start of `buffer`, and the bytes after it; null while it is incomplete. */
export function parseReply(buffer: Buffer, start = 0): { reply: RespReply; end: number } | null {
	const lineEnd = buffer.indexOf('\r\n', start);
	if (lineEnd === -1) {
		return null;
	}
	const kind = String.fromCharCode(buffer[start]);
	const line = buffer.toString('utf8', start + 1, lineEnd);
	const next = lineEnd + 2;

	if (kind === '+') {
		return { reply: line, end: next };
	}
	if (kind === '-') {
		return { reply: new RespError(line), end: next };
	}
	if (kind === ':') {
		return { reply: Number(line), end: next };
	}
	if (kind === '$') {
		const length = Number(line);
		if (length < 0) {
			return { reply: null, end: next };
		}
		if (buffer.length < next + length + 2) {
			return null;
		}
		return { reply: buffer.toString('utf8', next, next + length), end: next + length + 2 };
	}
	if (kind === '*') {
		const count = Number(line);
		if (count < 0) {
			return { reply: null, end: next };
		}
		const items: RespReply[] = [];
		let position = next;
		for (let index = 0; index < count; index += 1) {
			const item = parseReply(buffer, position);
			if (item === null) {
				return null;
			}
			items.push(item.reply);
			position = item.end;
		}
		return { reply: items, end: position };
	}
	throw new Error(`Unexpected reply from the server: "${kind}".`);
}

/** A field of the text INFO answers, such as `redis_version`. */
export function infoField(info: string, name: string): string | null {
	for (const line of info.split(/\r?\n/)) {
		if (line.startsWith(`${name}:`)) {
			return line.slice(name.length + 1).trim();
		}
	}
	return null;
}
