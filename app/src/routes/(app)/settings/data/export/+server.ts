import { version } from '$app/environment';
import { localizeHref } from '$lib/paraglide/runtime.js';
import { ownerActor } from '$lib/server/actor';
import { originOf, recordAudit } from '$lib/server/audit';
import { writeBackup } from '$lib/server/backup/backup';
import { pgCommand } from '$lib/server/backup/pg-tools';
import { getEnv } from '$lib/server/env';
import { uploadDirectory } from '$lib/server/files/storage';
import { requireUser } from '$lib/server/guard';
import { isSteppedUp } from '$lib/server/step-up';
import { error, redirect } from '@sveltejs/kit';
import { PassThrough, Readable } from 'node:stream';
import type { RequestHandler } from './$types';

// "Download export": the same archive as the CLI's backup, streamed. It needs a step-up; without
// one the owner is sent to confirm and comes back here.
export const GET: RequestHandler = async (event) => {
	const { user, session } = requireUser(event.locals);
	if (!(await isSteppedUp(session.id))) {
		redirect(
			303,
			`${localizeHref('/step-up')}?redirectTo=${encodeURIComponent(event.url.pathname)}`
		);
	}
	try {
		// Fails early, before the download starts, when pg_dump is missing.
		pgCommand('pg_dump');
	} catch (cause) {
		console.error('The export cannot run.', cause);
		error(500);
	}

	await recordAudit({
		actor: ownerActor(user.id),
		action: 'data.export',
		origin: originOf(event)
	});
	const stream = new PassThrough();
	writeBackup(stream, {
		databaseUrl: getEnv().DATABASE_URL,
		uploadDir: uploadDirectory(),
		version
	}).catch((cause: unknown) => {
		console.error('The export failed.', cause);
		stream.destroy(cause instanceof Error ? cause : new Error('The export failed.'));
	});

	const date = new Date().toISOString().slice(0, 10);
	return new Response(Readable.toWeb(stream) as ReadableStream, {
		headers: {
			'content-type': 'application/gzip',
			'content-disposition': `attachment; filename="manifold-backup-${date}.tar.gz"`,
			'cache-control': 'no-store'
		}
	});
};
