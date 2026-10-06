import type { NoteTokenView } from './types';

export type NoteTokenStatus = 'active' | 'revoked' | 'expired';

/** Revoked wins over expired: revoking is what the owner did, expiring what time did. */
export function noteTokenStatus(token: NoteTokenView, now = new Date()): NoteTokenStatus {
	if (token.revokedAt !== null) {
		return 'revoked';
	}
	if (token.expiresAt <= now) {
		return 'expired';
	}
	return 'active';
}
