import type { Locale } from '$lib/paraglide/runtime.js';
import { getEnv } from '../../env';
import { renderMail, type MailContent, type MailContext } from './layout';
import { deliver } from './transport';

export type { MailContent, MailContext } from './layout';

/** Renders a template for the organization in `locale` and sends it. */
export async function sendMail(
	to: string,
	locale: Locale,
	build: (context: MailContext) => MailContent
): Promise<void> {
	const context: MailContext = { organizationName: getEnv().ORGANIZATION_NAME, locale };
	await deliver(to, renderMail(build(context), context));
}

/**
 * Sends without waiting, for notices and codes whose outcome must not delay or change the response.
 * Failures are logged without the mail's content.
 */
export function sendMailInBackground(
	to: string,
	locale: Locale,
	build: (context: MailContext) => MailContent
): void {
	sendMail(to, locale, build).catch((error: unknown) => {
		console.error('Sending a mail failed.', error);
	});
}
