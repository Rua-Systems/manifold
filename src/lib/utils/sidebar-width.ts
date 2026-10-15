// The sidebar's width when expanded on a desktop, which the owner sets by dragging its edge. The
// limits match the check on user_setting.sidebar_width (migrations/0018_core_sidebar_width.sql).

export const SIDEBAR_MIN_WIDTH = 200;
export const SIDEBAR_MAX_WIDTH = 500;
/** 16rem, the width the sidebar has until the owner drags it. */
export const SIDEBAR_DEFAULT_WIDTH = 256;
/** How far one arrow key press moves the edge. */
export const SIDEBAR_WIDTH_STEP = 16;

/** Keeps a width within the limits, rounded to whole pixels. */
export function clampSidebarWidth(width: number): number {
	return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)));
}

/**
 * Reads a width sent by the page: a whole number of pixels within the limits, or an empty value to
 * go back to the default (null). Anything else is undefined, which the action refuses.
 */
export function parseSidebarWidth(raw: FormDataEntryValue | null): number | null | undefined {
	if (raw === null || typeof raw !== 'string') {
		return undefined;
	}
	if (raw === '') {
		return null;
	}
	if (!/^\d{1,4}$/.test(raw)) {
		return undefined;
	}
	const width = Number(raw);
	if (width < SIDEBAR_MIN_WIDTH || width > SIDEBAR_MAX_WIDTH) {
		return undefined;
	}
	return width;
}
