import { dev } from '$app/environment';
import { locales } from '$lib/paraglide/runtime.js';
import { getEnv } from '$lib/server/env';
import { escapeHtml } from '$lib/server/services/mail/html';
import { renderMail, type MailContext } from '$lib/server/services/mail/layout';
import { isMailTemplateId, MAIL_TEMPLATES } from '$lib/server/services/mail/templates';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const PAGE_STYLE = `
	body { margin: 0; padding: 24px; background: #1b1f27; color: #e7ecf2; font-family: ui-monospace, monospace; }
	nav { margin-bottom: 24px; display: flex; gap: 16px; flex-wrap: wrap; }
	a { color: #3f9a73; }
	section { margin-bottom: 40px; }
	iframe { width: 100%; max-width: 640px; height: 640px; border: 1px solid #333a47; background: #07090d; }
	pre { max-width: 640px; white-space: pre-wrap; padding: 16px; background: #0e1117; border: 1px solid #333a47; }
`;

// Development tool: every template rendered in every locale, HTML and plain text side by side.
export const GET: RequestHandler = ({ params }) => {
	if (!dev || !isMailTemplateId(params.template)) {
		error(404);
	}

	const build = MAIL_TEMPLATES[params.template];
	const sections = locales.map((locale) => {
		const context: MailContext = { organizationName: getEnv().ORGANIZATION_NAME, locale };
		const mail = renderMail(build(context), context);
		return `<section>
<h2>${escapeHtml(locale)}: ${escapeHtml(mail.subject)}</h2>
<iframe title="${escapeHtml(locale)}" srcdoc="${escapeHtml(mail.html)}"></iframe>
<pre>${escapeHtml(mail.text)}</pre>
</section>`;
	});
	const links = Object.keys(MAIL_TEMPLATES)
		.map((id) => `<a href="./${id}">${id}</a>`)
		.join('\n');

	const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Mail preview: ${escapeHtml(params.template)}</title><style>${PAGE_STYLE}</style></head>
<body>
<nav>${links}</nav>
${sections.join('\n')}
</body>
</html>`;
	return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
};
