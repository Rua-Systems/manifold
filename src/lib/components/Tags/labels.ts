import { m } from '$lib/paraglide/messages.js';
import type { TagColor } from '$lib/types/tags';

/** The name of each tag color, for the color choice and its screen reader labels. */
export const TAG_COLOR_LABELS: Record<TagColor, () => string> = {
	gray: m.tags_color_gray,
	green: m.tags_color_green,
	teal: m.tags_color_teal,
	blue: m.tags_color_blue,
	violet: m.tags_color_violet,
	rose: m.tags_color_rose,
	amber: m.tags_color_amber,
	red: m.tags_color_red
};
