import type { ActorType } from '$lib/server/actor';
import type { FieldErrors } from './validation';

/** One of the owner's sessions; its token never leaves the server. */
export interface SessionView {
	id: string;
	current: boolean;
	browser: string | null;
	os: string | null;
	ip: string | null;
	createdAt: Date;
	lastActiveAt: Date;
}

export interface AuditEventView {
	id: string;
	occurredAt: Date;
	actorType: ActorType;
	actorId: string | null;
	action: string;
	targetType: string | null;
	targetId: string | null;
	ip: string | null;
	userAgent: string | null;
	metadata: Record<string, unknown>;
}

/** A TOTP setup waiting for its first code. */
export interface TwoFactorSetup {
	totpUri: string;
	/** The base32 secret, for typing into an app by hand. */
	secret: string;
	/** The address as a QR code image (`data:` URL). */
	qr: string;
}

export type SecurityFormState =
	| { form: 'twoFactorStart'; errors: FieldErrors; message: string }
	| ({ form: 'twoFactorSetup'; errors: FieldErrors; message: string } & TwoFactorSetup)
	| { form: 'twoFactorDisable'; errors: FieldErrors; message: string }
	| { form: 'backupCodesRegenerate'; errors: FieldErrors; message: string }
	| { form: 'backupCodes'; backupCodes: string[]; message: string }
	| { form: 'sessions'; message: string; stepUp?: boolean };
