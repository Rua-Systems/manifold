import type { RequestEvent } from '@sveltejs/kit';
import { isAPIError } from 'better-auth/api';
import QRCode from 'qrcode';
import { ownerActor } from './actor';
import { originOf, recordAudit } from './audit';
import { getAuth } from './auth';
import type { SignedIn } from './guard';

// Two factor authentication with TOTP and backup codes, always through Better Auth's twoFactor
// plugin. Enabling it and turning it off give the session a new id (Better Auth rotates it).

export type TwoFactorProblem = 'wrong_password' | 'wrong_code';

function apiErrorCode(cause: unknown): string | null {
	if (!isAPIError(cause)) {
		return null;
	}
	const body: unknown = cause.body;
	if (typeof body === 'object' && body !== null && 'code' in body) {
		return String(body.code);
	}
	return '';
}

/** The base32 secret inside an `otpauth://` address, for typing into an app by hand. */
export function totpSecret(totpUri: string): string {
	return new URL(totpUri).searchParams.get('secret') ?? '';
}

/** The address as a QR code image the page can show without scripts or inline SVG. */
export async function qrCodeImage(totpUri: string): Promise<string> {
	const svg = await QRCode.toString(totpUri, {
		type: 'svg',
		margin: 1,
		errorCorrectionLevel: 'M'
	});
	return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

/** First step: checks the password and creates an unconfirmed secret. */
export async function startSetup(
	event: RequestEvent,
	password: string
): Promise<{ totpUri: string } | TwoFactorProblem> {
	try {
		const result = await getAuth().api.enableTwoFactor({
			body: { password },
			headers: event.request.headers
		});
		if (!('totpURI' in result)) {
			throw new Error('Better Auth did not start a TOTP setup.');
		}
		return { totpUri: result.totpURI };
	} catch (cause) {
		if (apiErrorCode(cause) === null) {
			throw cause;
		}
		return 'wrong_password';
	}
}

/** Second step: a valid code turns it on. Answers the backup codes, to be shown once. */
export async function confirmSetup(
	event: RequestEvent,
	signedIn: SignedIn,
	code: string
): Promise<{ backupCodes: string[] } | TwoFactorProblem> {
	const auth = getAuth();
	try {
		await auth.api.verifyTOTP({ body: { code }, headers: event.request.headers });
	} catch (cause) {
		if (apiErrorCode(cause) === null) {
			throw cause;
		}
		return 'wrong_code';
	}
	const { backupCodes } = await auth.api.viewBackupCodes({ body: { userId: signedIn.user.id } });
	await recordAudit({
		actor: ownerActor(signedIn.user.id),
		action: 'auth.two_factor_enable',
		origin: originOf(event)
	});
	return { backupCodes };
}

/** Checks the current TOTP code of a signed in owner. */
async function checkCode(event: RequestEvent, code: string): Promise<boolean> {
	try {
		await getAuth().api.verifyTOTP({ body: { code }, headers: event.request.headers });
		return true;
	} catch (cause) {
		if (apiErrorCode(cause) === null) {
			throw cause;
		}
		return false;
	}
}

/**
 * Turns two factor authentication off. The password and a current code are asked on the spot,
 * which is the step-up this sensitive action needs.
 */
export async function disable(
	event: RequestEvent,
	signedIn: SignedIn,
	credentials: { password: string; code: string }
): Promise<'disabled' | TwoFactorProblem> {
	if (!(await checkCode(event, credentials.code))) {
		return 'wrong_code';
	}
	try {
		await getAuth().api.disableTwoFactor({
			body: { password: credentials.password },
			headers: event.request.headers
		});
	} catch (cause) {
		if (apiErrorCode(cause) === null) {
			throw cause;
		}
		return 'wrong_password';
	}
	await recordAudit({
		actor: ownerActor(signedIn.user.id),
		action: 'auth.two_factor_disable',
		origin: originOf(event)
	});
	return 'disabled';
}

/** Replaces the backup codes; the old ones stop working. Asks for the password and a code too. */
export async function regenerateBackupCodes(
	event: RequestEvent,
	signedIn: SignedIn,
	credentials: { password: string; code: string }
): Promise<{ backupCodes: string[] } | TwoFactorProblem> {
	if (!(await checkCode(event, credentials.code))) {
		return 'wrong_code';
	}
	let backupCodes: string[];
	try {
		const result = await getAuth().api.generateBackupCodes({
			body: { password: credentials.password },
			headers: event.request.headers
		});
		backupCodes = result.backupCodes;
	} catch (cause) {
		if (apiErrorCode(cause) === null) {
			throw cause;
		}
		return 'wrong_password';
	}
	await recordAudit({
		actor: ownerActor(signedIn.user.id),
		action: 'auth.backup_codes_regenerate',
		origin: originOf(event)
	});
	return { backupCodes };
}
