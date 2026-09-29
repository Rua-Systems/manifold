import { getRequestEvent } from '$app/server';
import { env } from '$env/dynamic/private';
import { m } from '$lib/paraglide/messages.js';
import { CODE_LENGTH } from '$lib/schemas/auth';
import { db } from '$lib/server/db';
import { sendMail, type MailMessage } from '$lib/server/services/mail';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';
import { betterAuth } from 'better-auth/minimal';
import { emailOTP } from 'better-auth/plugins';
import { sveltekitCookies } from 'better-auth/svelte-kit';

const OTP_EXPIRES_IN_SECONDS = 60 * 5;

function isOwnerEmail(email: string, ownerEmail: string): boolean {
	return email.trim().toLowerCase() === ownerEmail.trim().toLowerCase();
}

function otpMail(email: string, otp: string, type: string): MailMessage {
	const minutes = OTP_EXPIRES_IN_SECONDS / 60;

	if (type === 'forget-password') {
		return {
			to: email,
			subject: m.mail_reset_subject(),
			text: `${m.mail_reset_body({ otp, minutes })}\n\n${m.mail_ignore()}`
		};
	}
	return {
		to: email,
		subject: m.mail_sign_in_subject(),
		text: `${m.mail_sign_in_body({ otp, minutes })}\n\n${m.mail_ignore()}`
	};
}

function createAuth() {
	const secret = env.BETTER_AUTH_SECRET;
	const ownerEmail = env.OWNER_EMAIL;

	if (!secret) {
		throw new Error('BETTER_AUTH_SECRET is not set');
	}
	if (!ownerEmail) {
		throw new Error('OWNER_EMAIL is not set');
	}

	return betterAuth({
		baseURL: env.ORIGIN,
		secret,
		database: drizzleAdapter(db, { provider: 'pg' }),
		emailAndPassword: {
			enabled: true,
			disableSignUp: true,
			revokeSessionsOnPasswordReset: true
		},
		databaseHooks: {
			user: {
				create: {
					// The owner account is created by their first email code sign in. Nobody else
					// gets one.
					before: async (user) => {
						if (!isOwnerEmail(user.email, ownerEmail)) {
							throw new APIError('FORBIDDEN', { message: 'Sign up is closed.' });
						}
						return { data: user };
					}
				}
			}
		},
		plugins: [
			emailOTP({
				otpLength: CODE_LENGTH,
				expiresIn: OTP_EXPIRES_IN_SECONDS,
				sendVerificationOTP: async ({ email, otp, type }) => {
					// Sign up is open for email codes, so codes for any other address are dropped
					// here instead of turning the server into a mailer for strangers.
					if (!isOwnerEmail(email, ownerEmail)) {
						return;
					}

					// Not awaited, as Better Auth advises, so response timing does not reveal the
					// owner address.
					sendMail(otpMail(email, otp, type)).catch((error: unknown) => {
						console.error('Sending the verification code failed.', error);
					});
				}
			}),
			// Must stay last: it copies the cookies of every auth.api call onto the SvelteKit
			// response.
			sveltekitCookies(getRequestEvent)
		]
	});
}

export type Auth = ReturnType<typeof createAuth>;

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
