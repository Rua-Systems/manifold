// The vault's names for the core's AES-256-GCM sealing, which data sources use too.
export {
	EncryptionKeyError as VaultKeyError,
	parseEncryptionKey as parseVaultKey,
	seal,
	unseal,
	type SealedValue
} from '$lib/server/sealing';
