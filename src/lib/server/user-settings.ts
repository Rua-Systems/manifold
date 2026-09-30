import { baseLocale, isLocale, type Locale } from '$lib/paraglide/runtime.js';
import type { Theme } from '$lib/types/theme';
import { eq } from 'drizzle-orm';
import { getDb, type Database } from './db';
import { user, userSetting } from './db/schema';

// The owner's preferences: the locale for security notices and mails sent outside a request, and
// the theme a browser without its own choice starts with. Null means "not chosen".

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

/** The locale the owner chose for mails, or null when none was chosen. */
export async function chosenLocale(db: Database = getDb()): Promise<Locale | null> {
	const [owner] = await db.select({ id: user.id }).from(user).limit(1);
	if (owner === undefined) {
		return null;
	}
	const { locale } = await getUserSettings(owner.id, db);
	if (locale !== null && isLocale(locale)) {
		return locale;
	}
	return null;
}

/**
 * The locale for a mail sent without a request, such as from a CLI command or a background job:
 * the owner's chosen one, else the default.
 */
export async function preferredLocale(db: Database = getDb()): Promise<Locale> {
	return (await chosenLocale(db)) ?? baseLocale;
}
