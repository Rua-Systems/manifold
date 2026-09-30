import { getLocale } from '$lib/paraglide/runtime.js';
import type { RequestEvent } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { getDb } from './db';
import { knownUserAgent } from './db/schema';
import { emailEnabled } from './features';
import { sendMailInBackground } from './services/mail';
import { newSignInMail, passwordChangedMail, type ActivityMail } from './services/mail/templates';

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
 * Called after every successful sign in. Mails a notice when the browser is new and mail is
 * available. A failure here never blocks the sign in.
 */
export async function noteSignIn(event: RequestEvent, recipient: NoticeRecipient): Promise<void> {
	try {
		const activity = activityOf(event);
		const isNew = await rememberUserAgent(recipient.id, activity.userAgent);
		if (isNew && emailEnabled()) {
			sendMailInBackground(recipient.email, getLocale(), (context) =>
				newSignInMail(activity, context)
			);
		}
	} catch (error) {
		console.error('Recording the sign in failed.', error);
	}
}

/** Mails the owner that the password changed, when mail is available. */
export function notePasswordChanged(event: RequestEvent, email: string): void {
	if (!emailEnabled()) {
		return;
	}
	const activity = activityOf(event);
	sendMailInBackground(email, getLocale(), (context) => passwordChangedMail(activity, context));
}
