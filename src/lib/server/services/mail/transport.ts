import { dev } from '$app/environment';
import { createTransport, type Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { getEnv } from '../../env';
import type { RenderedMail } from './layout';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * A relay on the same machine may speak plain SMTP; anything else must upgrade to TLS 1.2 or
 * newer with a valid certificate, so the password and the mails never cross a network in clear.
 */
export function requiresTls(host: string): boolean {
	return !LOOPBACK_HOSTS.has(host.toLowerCase());
}

// One pooled SMTP connection shared by every request; it carries no per-user data.
let transporter: Transporter | undefined;

function getTransporter(): Transporter | undefined {
	const env = getEnv();
	if (env.SMTP_HOST === undefined) {
		return undefined;
	}

	if (transporter === undefined) {
		const options: SMTPTransport.Options = {
			host: env.SMTP_HOST,
			port: env.SMTP_PORT,
			secure: env.SMTP_SECURE,
			requireTLS: requiresTls(env.SMTP_HOST),
			tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true }
		};
		if (env.SMTP_USER !== undefined) {
			options.auth = { user: env.SMTP_USER, pass: env.SMTP_PASSWORD };
		}
		transporter = createTransport(options);
	}
	return transporter;
}

/** MAIL_FROM without a display name gets the organization name as one. */
export function senderAddress(mailFrom: string | undefined, organizationName: string): string {
	if (mailFrom === undefined) {
		return '';
	}
	if (mailFrom.includes('<')) {
		return mailFrom;
	}
	return `"${organizationName.replaceAll('"', '')}" <${mailFrom}>`;
}

/** Sends a rendered mail. Development without SMTP prints the text part to the console instead. */
export async function deliver(to: string, mail: RenderedMail): Promise<void> {
	const transport = getTransporter();
	if (transport === undefined) {
		if (dev) {
			console.info(`[mail] To: ${to}\n[mail] ${mail.subject}\n${mail.text}`);
			return;
		}
		throw new Error('SMTP_HOST is not set, so mail cannot be sent.');
	}

	const env = getEnv();
	await transport.sendMail({
		from: senderAddress(env.MAIL_FROM, env.ORGANIZATION_NAME),
		to,
		subject: mail.subject,
		text: mail.text,
		html: mail.html
	});
}
