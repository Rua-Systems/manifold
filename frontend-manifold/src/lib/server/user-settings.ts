import { baseLocale, isLocale, type Locale } from '$lib/paraglide/runtime.js';
import type { Theme } from '$lib/types/theme';
import { eq } from 'drizzle-orm';
import { getDb, type Database } from './db';
import { user, userSetting } from './db/schema';

// The owner's preferences: the locale for mails sent outside a request, and the theme a browser
// without its own choice starts with. Null means "not chosen".

export interface UserSettings {
	locale: Locale | null;
	theme: Theme | null;
}

const EMPTY: UserSettings = { locale: null, theme: null };

// One owner, read on every page: the settings are kept in memory and replaced on every save.
const cache = new Map<string, UserSettings>();

export async function getUserSettings(
	userId: string,
	db: Database = getDb()
): Promise<UserSettings> {
	const cached = cache.get(userId);
	if (cached !== undefined) {
		return cached;
	}
	const [row] = await db
		.select({ locale: userSetting.locale, theme: userSetting.theme })
		.from(userSetting)
		.where(eq(userSetting.userId, userId))
		.limit(1);
	const settings: UserSettings = row ?? EMPTY;
	cache.set(userId, settings);
	return settings;
}

export async function saveUserSettings(userId: string, settings: UserSettings): Promise<void> {
	const now = new Date();
	await getDb()
		.insert(userSetting)
		.values({ userId, ...settings, createdAt: now, updatedAt: now })
		.onConflictDoUpdate({ target: userSetting.userId, set: { ...settings, updatedAt: now } });
	cache.set(userId, settings);
}

/**
 * The locale for a mail sent without a request, such as from a CLI command or a background job:
 * the owner's preferred one, else the default. Mails sent while handling a request use the
 * request's locale instead.
 */
export async function preferredLocale(db: Database = getDb()): Promise<Locale> {
	const [owner] = await db.select({ id: user.id }).from(user).limit(1);
	if (owner === undefined) {
		return baseLocale;
	}
	const { locale } = await getUserSettings(owner.id, db);
	return locale !== null && isLocale(locale) ? locale : baseLocale;
}
