import { createHash } from 'node:crypto';
import net from 'node:net';
import { Client, type ConnectConfig } from 'ssh2';
import type { DataSourceSecrets, SshSettings } from './types';

// An SSH tunnel for a connection test, as DBeaver opens one: the database client connects to a
// port on 127.0.0.1, and every connection to it is forwarded through the SSH server to the target.
// The SSH server's host key is pinned by the first test that got through; a different key later
// stops the test, since that is what a man in the middle would show.

export interface Tunnel {
	/** Where the client connects instead of the target. */
	host: string;
	port: number;
	/** The SHA-256 fingerprint of the host key the SSH server showed. */
	fingerprint: string;
	close: () => void;
}

export class HostKeyChangedError extends Error {
	constructor(expected: string, seen: string) {
		super(`The SSH host key changed: expected ${expected}, the server showed ${seen}.`);
		this.name = 'HostKeyChangedError';
	}
}

/** The fingerprint OpenSSH prints for a host key: `SHA256:` and the unpadded base64 hash. */
export function fingerprintOf(key: Buffer): string {
	const hash = createHash('sha256').update(key).digest('base64').replace(/=+$/, '');
	return `SHA256:${hash}`;
}

function authOf(ssh: SshSettings, secrets: DataSourceSecrets): Partial<ConnectConfig> {
	if (ssh.auth === 'key') {
		return { privateKey: secrets.sshPrivateKey ?? '', passphrase: secrets.sshPassphrase };
	}
	return { password: secrets.sshPassword ?? '' };
}

export async function openTunnel(
	ssh: SshSettings,
	secrets: DataSourceSecrets,
	target: { host: string; port: number },
	timeoutMs: number
): Promise<Tunnel> {
	const client = new Client();
	let seen = '';

	await new Promise<void>((resolve, reject) => {
		client.once('ready', () => resolve());
		client.once('error', (error) => {
			if (ssh.fingerprint !== '' && seen !== '' && seen !== ssh.fingerprint) {
				reject(new HostKeyChangedError(ssh.fingerprint, seen));
				return;
			}
			reject(error);
		});
		client.connect({
			host: ssh.host,
			port: ssh.port,
			username: ssh.username,
			readyTimeout: timeoutMs,
			hostVerifier: (key: Buffer) => {
				seen = fingerprintOf(key);
				return ssh.fingerprint === '' || ssh.fingerprint === seen;
			},
			...authOf(ssh, secrets)
		});
	});

	const server = net.createServer((socket) => {
		client.forwardOut('127.0.0.1', 0, target.host, target.port, (error, stream) => {
			if (error) {
				socket.destroy();
				return;
			}
			socket.pipe(stream).pipe(socket);
			stream.on('error', () => socket.destroy());
			stream.on('close', () => socket.destroy());
			socket.on('error', () => stream.destroy());
		});
	});
	try {
		await new Promise<void>((resolve, reject) => {
			server.once('error', reject);
			server.listen(0, '127.0.0.1', () => resolve());
		});
	} catch (error) {
		client.end();
		throw error;
	}
	const address = server.address() as net.AddressInfo;
	return {
		host: '127.0.0.1',
		port: address.port,
		fingerprint: seen,
		close: () => {
			server.close();
			client.end();
		}
	};
}
