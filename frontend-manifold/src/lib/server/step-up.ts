import { m } from '$lib/paraglide/messages.js';
import { fail, type RequestEvent } from '@sveltejs/kit';
import { isAPIError } from 'better-auth/api';
import { eq } from 'drizzle-orm';
import { ownerActor } from './actor';
import { originOf, recordAudit } from './audit';
import { getAuth } from './auth';
import { getDb } from './db';
import { sessionStepUp } from './db/schema';
import type { SignedIn } from './guard';

// Step-up: sensitive actions need the owner to have re-entered their password, and a TOTP code
// when two factor authentication is on, in the current session within the last ten minutes.

export const STEP_UP_WINDOW_MS = 10 * 60 * 1000;

export async function isSteppedUp(sessionId: string, now = new Date()): Promise<boolean> {
	const [row] = await getDb()
		.select({ steppedUpAt: sessionStepUp.steppedUpAt })
		.from(sessionStepUp)
		.where(eq(sessionStepUp.sessionId, sessionId))
		.limit(1);
	return row !== undefined && now.getTime() - row.steppedUpAt.getTime() < STEP_UP_WINDOW_MS;
}

export async function recordStepUp(sessionId: string, now = new Date()): Promise<void> {
	await getDb()
		.insert(sessionStepUp)
		.values({ sessionId, steppedUpAt: now, createdAt: now, updatedAt: now })
		.onConflictDoUpdate({
			target: sessionStepUp.sessionId,
			set: { steppedUpAt: now, updatedAt: now }
		});
}

/**
 * What a sensitive form action answers when the step-up is missing or old. The page opens the
 * step-up dialog and, once the owner confirmed, submits the form again.
 */
export function stepUpRequired() {
	return fail(403, { stepUp: true, message: m.step_up_required() });
}

export type IdentityCheck = 'confirmed' | 'wrong_password' | 'wrong_code';

/**
 * Checks the password, and the TOTP code when two factor authentication is on, against the
 * signed in owner, and records the step-up when both match.
 */
export async function confirmIdentity(
	event: RequestEvent,
	signedIn: SignedIn,
	credentials: { password: string; code: string }
): Promise<IdentityCheck> {
	const auth = getAuth();
	const headers = event.request.headers;
	let result: IdentityCheck = 'confirmed';
	try {
		await auth.api.verifyPassword({ body: { password: credentials.password }, headers });
	} catch (cause) {
		if (!isAPIError(cause)) {
			throw cause;
		}
		result = 'wrong_password';
	}
	if (result === 'confirmed' && signedIn.user.twoFactorEnabled === true) {
		try {
			await auth.api.verifyTOTP({ body: { code: credentials.code }, headers });
		} catch (cause) {
			if (!isAPIError(cause)) {
				throw cause;
			}
			result = 'wrong_code';
		}
	}

	await recordAudit({
		actor: ownerActor(signedIn.user.id),
		action: result === 'confirmed' ? 'auth.step_up' : 'auth.step_up_failed',
		origin: originOf(event)
	});
	if (result === 'confirmed') {
		await recordStepUp(signedIn.session.id);
	}
	return result;
}
