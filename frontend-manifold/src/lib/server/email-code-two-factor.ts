import { createAuthMiddleware } from 'better-auth/api';
import { deleteSessionCookie } from 'better-auth/cookies';
import { generateRandomString } from 'better-auth/crypto';
import type { BetterAuthPlugin } from 'better-auth/types';

// Better Auth's twoFactor plugin asks for the second factor after a password sign in only. This
// plugin does the same after a sign in with an emailed code, with the same cookie and records, so
// the plugin's own verifyTOTP and verifyBackupCode endpoints finish either kind of sign in.

/** Name and lifetime of the plugin's pending challenge cookie (`two_factor`, ten minutes). */
const TWO_FACTOR_COOKIE_NAME = 'two_factor';
const TWO_FACTOR_COOKIE_MAX_AGE = 600;

export const emailCodeTwoFactor = {
	id: 'email-code-two-factor',
	hooks: {
		after: [
			{
				matcher: (context) => context.path === '/sign-in/email-otp',
				handler: createAuthMiddleware(async (ctx) => {
					const created = ctx.context.newSession;
					// The twoFactor plugin adds the column; the base user type does not know it.
					const user = created?.user as { twoFactorEnabled?: boolean | null } | undefined;
					if (created === null || user?.twoFactorEnabled !== true) {
						return;
					}

					// The code proved the first factor only: the new session goes, a challenge takes
					// its place.
					deleteSessionCookie(ctx, true);
					await ctx.context.internalAdapter.deleteSession(created.session.token);
					ctx.context.setNewSession(null);

					const cookie = ctx.context.createAuthCookie(TWO_FACTOR_COOKIE_NAME, {
						maxAge: TWO_FACTOR_COOKIE_MAX_AGE
					});
					const identifier = `2fa-${generateRandomString(20)}`;
					const expiresAt = new Date(Date.now() + TWO_FACTOR_COOKIE_MAX_AGE * 1000);
					await ctx.context.internalAdapter.createVerificationValue({
						value: created.user.id,
						identifier,
						expiresAt
					});
					await ctx.context.internalAdapter.createVerificationValue({
						value: '0',
						identifier: `2fa-attempts-${identifier}`,
						expiresAt
					});
					await ctx.setSignedCookie(
						cookie.name,
						identifier,
						ctx.context.secret,
						cookie.attributes
					);
					return ctx.json({ twoFactorRedirect: true, twoFactorMethods: ['totp'] });
				})
			}
		]
	}
} satisfies BetterAuthPlugin;
