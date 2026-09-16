import { Language } from '../types/language-types';

export const DEFAULT_LANGUAGE: Language = 'en';
export const SUPPORTED_LANGUAGES: readonly Language[] = ['en', 'tr'];

export const STORAGE_KEYS = {
	language: 'manifold.language',
	theme: 'manifold.theme',
} as const;
