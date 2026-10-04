import { DEVELOPER_NAME, DEVELOPER_URL, PRODUCT_NAME } from '$lib/constants';
import { m } from '$lib/paraglide/messages.js';
import type { Locale } from '$lib/paraglide/runtime.js';
import { escapeHtml } from './html';

// Mail clients ignore stylesheets and web fonts, so everything is inline and the font falls back to
// the local monospace fonts. The colours are the dark theme's from src/styles/_themes.scss.
const FONT = "'Space Mono', ui-monospace, Menlo, Consolas, monospace";
const BACKGROUND = '#07090d';
const SURFACE = '#0e1117';
const TEXT = '#e7ecf2';
const TEXT_SECONDARY = '#8a93a3';
const ACCENT = '#3f9a73';
const ACCENT_WASH = 'rgba(63, 154, 115, 0.12)';
const BORDER = 'rgba(231, 236, 242, 0.1)';

export interface MailDetail {
	label: string;
	value: string;
}

export interface MailContent {
	subject: string;
	sigil: string;
	title: string;
	paragraphs: string[];
	/** A one time code, shown large in its own box. */
	code?: string;
	details?: MailDetail[];
	/** Why the mail arrived: the ignore notice for codes, the reason for notices. */
	footer: string;
}

export interface MailContext {
	organizationName: string;
	locale: Locale;
}

export interface RenderedMail {
	subject: string;
	html: string;
	text: string;
}

function creditHtml(locale: Locale): string {
	const link = (href: string, label: string) =>
		`<a href="${escapeHtml(href)}" style="color: ${TEXT_SECONDARY}; text-decoration: underline;">${escapeHtml(label)}</a>`;

	return (
		escapeHtml(PRODUCT_NAME) +
		escapeHtml(m.credit_after_product({}, { locale })) +
		' ' +
		link(DEVELOPER_URL, DEVELOPER_NAME) +
		escapeHtml(m.credit_after_developer({}, { locale }))
	);
}

function creditText(locale: Locale): string {
	return (
		PRODUCT_NAME +
		m.credit_after_product({}, { locale }) +
		` ${DEVELOPER_NAME} (${DEVELOPER_URL})` +
		m.credit_after_developer({}, { locale })
	);
}

function paragraphHtml(text: string): string {
	return `<p style="margin: 0 0 16px; font-family: ${FONT}; font-size: 14px; line-height: 1.6; color: ${TEXT_SECONDARY};">${escapeHtml(text)}</p>`;
}

function codeHtml(code: string): string {
	return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 8px 0 24px;">
<tr><td align="center" style="padding: 18px 12px; background-color: ${ACCENT_WASH}; border: 1px solid ${ACCENT}; border-radius: 4px; font-family: ${FONT}; font-size: 30px; font-weight: 700; letter-spacing: 12px; color: ${TEXT};">${escapeHtml(code)}</td></tr>
</table>`;
}

function detailsHtml(details: MailDetail[]): string {
	const rows = details
		.map(
			(detail) =>
				`<tr><td style="padding: 6px 16px 6px 0; font-family: ${FONT}; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: ${TEXT_SECONDARY}; white-space: nowrap; vertical-align: top;">${escapeHtml(detail.label)}</td><td style="padding: 6px 0; font-family: ${FONT}; font-size: 13px; color: ${TEXT}; vertical-align: top;">${escapeHtml(detail.value)}</td></tr>`
		)
		.join('\n');
	return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 16px; border-top: 1px solid ${BORDER};">
${rows}
</table>`;
}

function renderHtml(content: MailContent, context: MailContext): string {
	let body = content.paragraphs.map(paragraphHtml).join('\n');
	if (content.code !== undefined) {
		body += '\n' + codeHtml(content.code);
	}
	if (content.details !== undefined && content.details.length > 0) {
		body += '\n' + detailsHtml(content.details);
	}

	return `<!doctype html>
<html lang="${escapeHtml(context.locale)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${escapeHtml(content.subject)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: ${BACKGROUND};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: ${BACKGROUND};">
<tr><td align="center" style="padding: 32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 560px;">
<tr><td style="padding: 0 4px 16px; font-family: ${FONT}; font-size: 12px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; color: ${TEXT};">${escapeHtml(context.organizationName)}</td></tr>
<tr><td style="padding: 32px 28px 16px; background-color: ${SURFACE}; border: 1px solid ${BORDER}; border-radius: 4px;">
<p style="margin: 0 0 12px; font-family: ${FONT}; font-size: 11px; letter-spacing: 3px; text-transform: uppercase; color: ${ACCENT};">++ ${escapeHtml(content.sigil)} ++</p>
<h1 style="margin: 0 0 20px; font-family: ${FONT}; font-size: 22px; line-height: 1.25; font-weight: 700; color: ${TEXT};">${escapeHtml(content.title)}</h1>
${body}
</td></tr>
<tr><td style="padding: 20px 4px 0; font-family: ${FONT}; font-size: 11px; line-height: 1.6; color: ${TEXT_SECONDARY};">
<p style="margin: 0 0 12px;">${escapeHtml(content.footer)}</p>
<p style="margin: 0;">${creditHtml(context.locale)}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;
}

function renderText(content: MailContent, context: MailContext): string {
	const lines = [context.organizationName, '', `++ ${content.sigil} ++`, content.title, ''];
	for (const paragraph of content.paragraphs) {
		lines.push(paragraph, '');
	}
	if (content.code !== undefined) {
		lines.push(`    ${content.code}`, '');
	}
	if (content.details !== undefined && content.details.length > 0) {
		for (const detail of content.details) {
			lines.push(`${detail.label}: ${detail.value}`);
		}
		lines.push('');
	}
	lines.push(content.footer, '', creditText(context.locale), '');
	return lines.join('\n');
}

/** Renders the HTML and the plain text part of a mail from the same content. */
export function renderMail(content: MailContent, context: MailContext): RenderedMail {
	return {
		subject: content.subject,
		html: renderHtml(content, context),
		text: renderText(content, context)
	};
}
