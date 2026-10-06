/** Who performed a write: recorded on note revisions and, from Phase 6 on, in the audit log. */
export type ActorType = 'owner' | 'api_key' | 'note_token' | 'cli' | 'system';

export interface Actor {
	type: ActorType;
	/** The user id for the owner, the key or token id for an API key or note token, else null. */
	id: string | null;
}

export function ownerActor(userId: string): Actor {
	return { type: 'owner', id: userId };
}

export const SYSTEM_ACTOR: Actor = { type: 'system', id: null };
