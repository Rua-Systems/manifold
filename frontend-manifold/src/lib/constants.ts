export const APP_NAME = 'Manifold';

export const SITE_NAME = 'Rua Systems';

export const SITE_URL = 'https://rua.systems';

export const DEFAULT_TITLE = `${APP_NAME} · ${SITE_NAME}`;

export function pageTitle(section: string): string {
	return `${section} · ${DEFAULT_TITLE}`;
}
