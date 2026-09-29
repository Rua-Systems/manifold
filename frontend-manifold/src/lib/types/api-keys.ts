/** An API key as Settings lists it; the key itself is never stored. */
export interface ApiKeyView {
	id: string;
	name: string;
	prefix: string;
	scopes: string[];
	expiresAt: Date | null;
	lastUsedAt: Date | null;
	lastUsedIp: string | null;
	revokedAt: Date | null;
	createdAt: Date;
}
