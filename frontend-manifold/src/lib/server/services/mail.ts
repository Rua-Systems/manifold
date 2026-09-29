import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { createTransport, type Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

const DEFAULT_SMTP_PORT = 587;

export interface MailMessage {
	to: string;
	subject: string;
	text: string;
}

// One pooled SMTP connection shared by every request; it carries no per-user data.
let transporter: Transporter | undefined;

function getTransporter(): Transporter | undefined {
	if (!env.SMTP_HOST) {
		return undefined;
	}

	if (transporter === undefined) {
		const options: SMTPTransport.Options = {
			host: env.SMTP_HOST,
			port: Number(env.SMTP_PORT ?? DEFAULT_SMTP_PORT),
			secure: env.SMTP_SECURE === 'true'
		};
		if (env.SMTP_USER) {
			options.auth = { user: env.SMTP_USER, pass: env.SMTP_PASSWORD };
		}
		transporter = createTransport(options);
	}
	return transporter;
}

export async function sendMail(message: MailMessage): Promise<void> {
	const transport = getTransporter();
	if (transport === undefined) {
		if (dev) {
			console.info(`[mail] To: ${message.to}\n[mail] ${message.subject}\n${message.text}`);
			return;
		}
		throw new Error('SMTP_HOST is not set');
	}

	await transport.sendMail({ from: env.MAIL_FROM, ...message });
}
