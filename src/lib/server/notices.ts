import { getLocale, type Locale } from '$lib/paraglide/runtime.js';
import type { RequestEvent } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { getDb } from './db';
import { knownUserAgent } from './db/schema';
import { emailEnabled } from './features';
import { sendMailInBackground } from './services/mail';
import { newSignInMail, passwordChangedMail, type ActivityMail } from './services/mail/templates';
import { chosenLocale } from './user-settings';

interface NoticeRecipient {
	id: string;
	email: string;
}

function hashUserAgent(userAgent: string | null): string {
	return createHash('sha256')
		.update(userAgent ?? '')
		.digest('hex');
}

/** Records the browser and reports whether the owner had never signed in from it before. */
export async function rememberUserAgent(
	userId: string,
	userAgent: string | null
): Promise<boolean> {
	const db = getDb();
	const userAgentHash = hashUserAgent(userAgent);

	const [created] = await db
		.insert(knownUserAgent)
		.values({ userId, userAgentHash })
		.onConflictDoNothing()
		.returning({ id: knownUserAgent.id });
	if (created !== undefined) {
		return true;
	}

	await db
		.update(knownUserAgent)
		.set({ updatedAt: new Date() })
		.where(
			and(eq(knownUserAgent.userId, userId), eq(knownUserAgent.userAgentHash, userAgentHash))
		);
	return false;
}

function activityOf(event: RequestEvent): ActivityMail {
	return {
		time: new Date(),
		ip: event.getClientAddress(),
		userAgent: event.request.headers.get('user-agent')
	};
}

/**
 * The locale of a security notice. Someone else may have caused it, from a page in another
 * language, so the owner's chosen mail language wins over the language of the request.
 */
export async function noticeLocale(requestLocale: Locale): Promise<Locale> {
	return (await chosenLocale()) ?? requestLocale;
}

/**
 * Called after every successful sign in. Mails a notice when the browser is new and mail is
 * available. A failure here never blocks the sign in.
 */
export async function noteSignIn(event: RequestEvent, recipient: NoticeRecipient): Promise<void> {
	try {
		const activity = activityOf(event);
		const isNew = await rememberUserAgent(recipient.id, activity.userAgent);
		if (isNew && emailEnabled()) {
			const locale = await noticeLocale(getLocale());
			sendMailInBackground(recipient.email, locale, (context) =>
				newSignInMail(activity, context)
			);
		}
	} catch (error) {
		console.error('Recording the sign in failed.', error);
	}
}

/**
 * Mails the owner that the password changed, when mail is available. A failure here never blocks
 * the change.
 */
export async function notePasswordChanged(event: RequestEvent, email: string): Promise<void> {
	if (!emailEnabled()) {
		return;
	}
	try {
		const activity = activityOf(event);
		const locale = await noticeLocale(getLocale());
		sendMailInBackground(email, locale, (context) => passwordChangedMail(activity, context));
	} catch (error) {
		console.error('Sending the password notice failed.', error);
	}
}
