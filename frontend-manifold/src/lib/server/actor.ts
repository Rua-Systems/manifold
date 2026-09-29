/** Who performed a write: recorded on note revisions and, from Phase 6 on, in the audit log. */
export type ActorType = 'owner' | 'api_key' | 'cli' | 'system';

export interface Actor {
	type: ActorType;
	/** The user id for the owner, the key id for an API key, null otherwise. */
	id: string | null;
}

export function ownerActor(userId: string): Actor {
	return { type: 'owner', id: userId };
}

export const SYSTEM_ACTOR: Actor = { type: 'system', id: null };
