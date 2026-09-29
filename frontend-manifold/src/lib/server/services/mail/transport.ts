import { dev } from '$app/environment';
import { createTransport, type Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { getEnv } from '../../env';
import type { RenderedMail } from './layout';

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
			secure: env.SMTP_SECURE
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
