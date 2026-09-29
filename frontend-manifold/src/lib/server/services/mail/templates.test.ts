import { locales } from '$lib/paraglide/runtime.js';
import { describe, expect, it } from 'vitest';
import { renderMail, type MailContext } from './layout';
import {
	describeDevice,
	MAIL_TEMPLATES,
	passwordChangedMail,
	type MailTemplateId
} from './templates';

const TEMPLATE_IDS = Object.keys(MAIL_TEMPLATES) as MailTemplateId[];

function contextFor(locale: MailContext['locale'], organizationName = 'Iron Archive'): MailContext {
	return { organizationName, locale };
}

describe('mail templates', () => {
	for (const id of TEMPLATE_IDS) {
		for (const locale of locales) {
			it(`${id} renders both parts in ${locale}`, () => {
				const context = contextFor(locale);
				const content = MAIL_TEMPLATES[id](context);
				const mail = renderMail(content, context);

				expect(mail.subject.length).toBeGreaterThan(0);
				expect(mail.html).toMatch(/^<!doctype html>/);
				expect(mail.html).toContain(`lang="${locale}"`);
				expect(mail.html).toContain(`++ ${content.sigil} ++`);
				expect(mail.html).toContain('Iron Archive');
				expect(mail.text).toContain(`++ ${content.sigil} ++`);
				expect(mail.text).toContain(content.title);
				expect(mail.text).toContain(content.footer);
			});

			it(`${id} carries the credit in ${locale}`, () => {
				const context = contextFor(locale);
				const mail = renderMail(MAIL_TEMPLATES[id](context), context);

				expect(mail.html).toContain('href="https://rua.systems"');
				expect(mail.html).toContain('href="https://github.com/justhasanuknow"');
				expect(mail.html).toContain('Manifold');
				expect(mail.text).toContain('Rua Systems (https://rua.systems)');
				expect(mail.text).toContain('Hasan (https://github.com/justhasanuknow)');
			});
		}
	}

	it('uses the locale for every word', () => {
		const english = renderMail(
			MAIL_TEMPLATES['sign-in-code'](contextFor('en')),
			contextFor('en')
		);
		const turkish = renderMail(
			MAIL_TEMPLATES['sign-in-code'](contextFor('tr')),
			contextFor('tr')
		);

		expect(english.subject).toBe('Your Iron Archive sign in code');
		expect(turkish.subject).toBe('Iron Archive giriş kodunuz');
		expect(turkish.text).toContain('tarafından geliştirildi.');
	});

	it('shows one time codes in both parts', () => {
		const context = contextFor('en');
		const mail = renderMail(MAIL_TEMPLATES['password-reset-code'](context), context);

		expect(mail.html).toContain('482915');
		expect(mail.text).toContain('    482915');
	});

	it('escapes interpolated values in the HTML part', () => {
		const hostile = '<script>alert("x")</script> & Co';
		const context = contextFor('en', hostile);
		const content = passwordChangedMail(
			{ time: new Date(0), ip: '<img src=x onerror=alert(1)>', userAgent: null },
			context
		);
		const mail = renderMail(content, context);

		expect(mail.html).not.toContain('<script>');
		expect(mail.html).not.toContain('<img src=x');
		expect(mail.html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; Co');
		expect(mail.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
		expect(mail.text).toContain(hostile);
	});

	it('keeps the layout within 560 px and inline styled', () => {
		const context = contextFor('en');
		const mail = renderMail(MAIL_TEMPLATES['new-sign-in'](context), context);

		expect(mail.html).toContain('max-width: 560px');
		expect(mail.html).not.toContain('<style');
		expect(mail.html).not.toContain('<link');
	});
});

describe('describeDevice', () => {
	it('names the browser and the system in the mail locale', () => {
		const agent = 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';

		expect(describeDevice(agent, 'en')).toBe('Firefox on Linux');
		expect(describeDevice(agent, 'tr')).toBe('Linux üzerinde Firefox');
		expect(describeDevice(null, 'en')).toBe('Unknown');
	});
});
