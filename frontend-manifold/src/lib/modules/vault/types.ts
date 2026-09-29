/** A secret without its value, as the list, the API and MCP see it. */
export interface VaultSecretView {
	id: string;
	name: string;
	serviceUrl: string | null;
	description: string | null;
	lastRevealedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

export type VaultFormState =
	| {
			form: 'create' | 'update';
			success: boolean;
			message: string;
			errors: Record<string, string>;
			stepUp?: boolean;
	  }
	| { form: 'delete'; success: boolean; message: string };
