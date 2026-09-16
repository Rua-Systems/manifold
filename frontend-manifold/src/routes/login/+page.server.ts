import { issueLoginCode, verifyLoginCode, verifyPassword } from '$lib/server/auth';
import { writeSession } from '$lib/server/session';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';

const FALLBACK_TARGET = '/dashboard';

function safeTarget(target: FormDataEntryValue | null): string {
	if (typeof target !== 'string' || target.length === 0) {
		return FALLBACK_TARGET;
	}
	if (target.startsWith('/') && !target.startsWith('//')) {
		return target;
	}
	return FALLBACK_TARGET;
}

function readField(data: FormData, name: string): string {
	const value = data.get(name);
	if (typeof value !== 'string') {
		return '';
	}
	return value;
}

export const actions: Actions = {
	password: async ({ request, cookies }) => {
		const data = await request.formData();
		const email = readField(data, 'email');
		const password = readField(data, 'password');

		const user = verifyPassword(email, password);
		if (user === null) {
			return fail(401, {
				email,
				sent: false,
				message: 'Those credentials were not accepted.'
			});
		}

		writeSession(cookies, user);
		redirect(303, safeTarget(data.get('redirectTo')));
	},

	requestCode: async ({ request }) => {
		const data = await request.formData();
		const email = readField(data, 'email');

		if (!issueLoginCode(email)) {
			return fail(400, {
				email,
				sent: false,
				message: 'A code could not be sent to that address.'
			});
		}
		return { email, sent: true, message: '' };
	},

	verifyCode: async ({ request, cookies }) => {
		const data = await request.formData();
		const email = readField(data, 'email');
		const code = readField(data, 'code');

		const user = verifyLoginCode(email, code);
		if (user === null) {
			return fail(401, { email, sent: true, message: 'That code was not accepted.' });
		}

		writeSession(cookies, user);
		redirect(303, safeTarget(data.get('redirectTo')));
	}
};
