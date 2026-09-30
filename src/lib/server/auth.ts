import { getRequestEvent } from '$app/server';
import { getLocale } from '$lib/paraglide/runtime.js';
import {
	CODE_LENGTH,
	PASSWORD_MAX_LENGTH,
	PASSWORD_MIN_LENGTH,
	USERNAME_MAX_LENGTH,
	USERNAME_MIN_LENGTH,
	USERNAME_PATTERN
} from '$lib/schemas/rules';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';
import { betterAuth } from 'better-auth/minimal';
import { emailOTP, twoFactor, username } from 'better-auth/plugins';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { count } from 'drizzle-orm';
import { generateBackupCodes } from './backup-codes';
import { getDb } from './db';
import { user } from './db/schema';
import { emailCodeTwoFactor } from './email-code-two-factor';
import { getEnv } from './env';
import { hashPassword, verifyPassword } from './passwords/hash';
import { sendMailInBackground, type MailContent, type MailContext } from './services/mail';
import { passwordResetCodeMail, signInCodeMail } from './services/mail/templates';

const OTP_EXPIRES_IN_SECONDS = 60 * 5;

/**
 * The request header that carries the client address to Better Auth. The session hook sets it to
 * adapter-node's client address, which honors ADDRESS_HEADER and XFF_DEPTH, and overwrites
 * anything a client sent under that name.
 */
export const CLIENT_ADDRESS_HEADER = 'x-manifold-client-address';

async function hasAnyUser(): Promise<boolean> {
	const [{ total }] = await getDb().select({ total: count() }).from(user);
	return total > 0;
}

function otpMail(code: string, type: string): (context: MailContext) => MailContent {
	const input = { code, minutes: OTP_EXPIRES_IN_SECONDS / 60 };

	if (type === 'forget-password') {
		return (context) => passwordResetCodeMail(input, context);
	}
	return (context) => signInCodeMail(input, context);
}

function createAuth() {
	const env = getEnv();

	return betterAuth({
		baseURL: env.ORIGIN,
		secret: env.BETTER_AUTH_SECRET,
		database: drizzleAdapter(getDb(), { provider: 'pg' }),
		telemetry: { enabled: false },
		advanced: {
			ipAddress: { ipAddressHeaders: [CLIENT_ADDRESS_HEADER] }
		},
		emailAndPassword: {
			enabled: true,
			disableSignUp: true,
			minPasswordLength: PASSWORD_MIN_LENGTH,
			maxPasswordLength: PASSWORD_MAX_LENGTH,
			revokeSessionsOnPasswordReset: true,
			password: {
				hash: hashPassword,
				verify: ({ hash, password }) => verifyPassword(hash, password)
			}
		},
		databaseHooks: {
			user: {
				create: {
					// The owner is created by the startup bootstrap. Nothing may add a second user.
					before: async (data) => {
						if (await hasAnyUser()) {
							throw new APIError('FORBIDDEN', { message: 'Sign up is closed.' });
						}
						return { data };
					}
				}
			}
		},
		plugins: [
			username({
				minUsernameLength: USERNAME_MIN_LENGTH,
				maxUsernameLength: USERNAME_MAX_LENGTH,
				usernameValidator: (value) => USERNAME_PATTERN.test(value)
			}),
			emailOTP({
				otpLength: CODE_LENGTH,
				expiresIn: OTP_EXPIRES_IN_SECONDS,
				storeOTP: 'hashed',
				disableSignUp: true,
				sendVerificationOTP: async ({ email, otp, type }) => {
					// Not awaited, as Better Auth advises, so response timing does not reveal whether
					// the address belongs to the owner.
					sendMailInBackground(email, getLocale(), otpMail(otp, type));
				}
			}),
			twoFactor({
				// Shown by authenticator apps next to the account.
				issuer: env.ORGANIZATION_NAME,
				backupCodeOptions: { customBackupCodesGenerate: generateBackupCodes },
				otpOptions: { storeOTP: 'hashed' }
			}),
			// After twoFactor, whose challenge it reuses for sign ins with an emailed code.
			emailCodeTwoFactor,
			// Must stay last: it copies the cookies of every auth.api call onto the SvelteKit
			// response.
			sveltekitCookies(getRequestEvent)
		]
	});
}

export type Auth = ReturnType<typeof createAuth>;

export type AuthUser = Auth['$Infer']['Session']['user'];

export type AuthSession = Auth['$Infer']['Session']['session'];

// Shared by every request; it holds configuration, never per-user data.
let instance: Auth | undefined;

/**
 * Returns the Better Auth instance, creating it on first use. `vite build` imports server modules
 * without runtime secrets, so creating it at import time would fail the build.
 */
export function getAuth(): Auth {
	if (instance === undefined) {
		instance = createAuth();
	}
	return instance;
}
