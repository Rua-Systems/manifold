import { dev } from '$app/env';
import type { Features } from '#lib/types/features.ts';
import { getEnv } from './env';

/** Email sign in and reset need SMTP in production; development prints mails to the console. */
export function emailEnabled(): boolean {
	return dev || getEnv().SMTP_HOST !== undefined;
}

export function getFeatures(): Features {
	return { email: emailEnabled() };
}
