import { m } from '$lib/paraglide/messages.js';
import type { Locale } from '$lib/paraglide/runtime.js';
import { summarizeUserAgent } from '$lib/utils/user-agent';
import type { MailContent, MailContext, MailDetail } from './layout';

export interface CodeMail {
	code: string;
	minutes: number;
}

export interface ActivityMail {
	time: Date;
	ip: string | null;
	userAgent: string | null;
}

export function formatMailTime(time: Date, locale: Locale): string {
	return new Intl.DateTimeFormat(locale, {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		timeZone: 'UTC',
		timeZoneName: 'short'
	}).format(time);
}

export function describeDevice(userAgent: string | null, locale: Locale): string {
	const { browser, os } = summarizeUserAgent(userAgent);
	if (browser !== null && os !== null) {
		return m.mail_device({ browser, os }, { locale });
	}
	return browser ?? os ?? m.mail_unknown({}, { locale });
}

function activityDetails(activity: ActivityMail, locale: Locale): MailDetail[] {
	return [
		{ label: m.mail_detail_time({}, { locale }), value: formatMailTime(activity.time, locale) },
		{
			label: m.mail_detail_ip({}, { locale }),
			value: activity.ip ?? m.mail_unknown({}, { locale })
		},
		{
			label: m.mail_detail_device({}, { locale }),
			value: describeDevice(activity.userAgent, locale)
		}
	];
}

export function signInCodeMail(input: CodeMail, context: MailContext): MailContent {
	const { locale, organizationName: organization } = context;
	return {
		subject: m.mail_sign_in_subject({ organization }, { locale }),
		sigil: m.mail_sign_in_sigil({}, { locale }),
		title: m.mail_sign_in_title({}, { locale }),
		paragraphs: [m.mail_sign_in_body({ minutes: input.minutes }, { locale })],
		code: input.code,
		footer: m.mail_ignore({}, { locale })
	};
}

export function passwordResetCodeMail(input: CodeMail, context: MailContext): MailContent {
	const { locale, organizationName: organization } = context;
	return {
		subject: m.mail_reset_subject({ organization }, { locale }),
		sigil: m.mail_reset_sigil({}, { locale }),
		title: m.mail_reset_title({}, { locale }),
		paragraphs: [m.mail_reset_body({ minutes: input.minutes }, { locale })],
		code: input.code,
		footer: m.mail_ignore({}, { locale })
	};
}

export function passwordChangedMail(input: ActivityMail, context: MailContext): MailContent {
	const { locale, organizationName: organization } = context;
	return {
		subject: m.mail_password_changed_subject({ organization }, { locale }),
		sigil: m.mail_password_changed_sigil({}, { locale }),
		title: m.mail_password_changed_title({}, { locale }),
		paragraphs: [
			m.mail_password_changed_body({}, { locale }),
			m.mail_password_changed_warning({}, { locale })
		],
		details: activityDetails(input, locale),
		footer: m.mail_notice_reason({}, { locale })
	};
}

export function newSignInMail(input: ActivityMail, context: MailContext): MailContent {
	const { locale, organizationName: organization } = context;
	return {
		subject: m.mail_new_sign_in_subject({ organization }, { locale }),
		sigil: m.mail_new_sign_in_sigil({}, { locale }),
		title: m.mail_new_sign_in_title({}, { locale }),
		paragraphs: [
			m.mail_new_sign_in_body({}, { locale }),
			m.mail_new_sign_in_warning({}, { locale })
		],
		details: activityDetails(input, locale),
		footer: m.mail_notice_reason({}, { locale })
	};
}

const SAMPLE_ACTIVITY: ActivityMail = {
	time: new Date(Date.UTC(2026, 8, 29, 14, 30)),
	ip: '203.0.113.24',
	userAgent:
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'
};

const SAMPLE_CODE: CodeMail = { code: '482915', minutes: 5 };

/** Every template with sample values, for the development preview and the tests. */
export const MAIL_TEMPLATES = {
	'sign-in-code': (context: MailContext) => signInCodeMail(SAMPLE_CODE, context),
	'password-reset-code': (context: MailContext) => passwordResetCodeMail(SAMPLE_CODE, context),
	'password-changed': (context: MailContext) => passwordChangedMail(SAMPLE_ACTIVITY, context),
	'new-sign-in': (context: MailContext) => newSignInMail(SAMPLE_ACTIVITY, context)
} satisfies Record<string, (context: MailContext) => MailContent>;

export type MailTemplateId = keyof typeof MAIL_TEMPLATES;

export function isMailTemplateId(value: string): value is MailTemplateId {
	return Object.hasOwn(MAIL_TEMPLATES, value);
}
