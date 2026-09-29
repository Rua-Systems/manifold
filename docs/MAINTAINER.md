# Manifold maintainer guide

This guide is completed at the end of Batch 01. Until then it holds the decisions made while building the batch.

## Decisions

Choices the Batch 01 specification left open, with the reason for each.

### Phase 1: Foundation

- **Protected routes are guarded in `hooks.server.ts`.** SvelteKit runs form actions before any layout `load`, so a layout guard alone would leave the actions of `(app)` pages open. `guardRequest` redirects page requests to sign in and answers everything else with `401`. The `(app)` layout load still asserts the session.
- **`/services` exists from Phase 1 as an empty page.** It is the post sign in target from Phase 1 on; Phase 3 replaces it with the services module.
- **Old `/dashboard` links answer `308` to `/services`.** Bookmarks keep working, including through sign in.
- **Better Auth tables use `timestamptz`.** Better Auth reads and writes JavaScript dates, so the column type is invisible to it, and every other table uses `timestamptz`.
- **The bootstrapped owner gets a random UUID as its id.** Better Auth ids are free text; a UUID is as good as Better Auth's own generator and needs no Better Auth instance, so the CLI can share the code.
- **Owner bootstrap holds an advisory transaction lock** and counts users inside it, so two app instances starting together cannot both create an owner.
- **Changing the email address takes effect at once, without a confirmation mail.** It must work without SMTP, and there is only one account. The address stays marked verified, because Better Auth's email code plugin removes the password of accounts whose address is unverified.
- **Sign in decides between username and email by the `@` sign.** Usernames cannot contain `@`, so the single identifier field is never ambiguous. Usernames match case insensitively; Better Auth stores them in lower case.
- **`Permissions-Policy` allows geolocation for the app itself and turns off camera, microphone, payment and USB.** Features the browser does not know are left out, because they only produce console warnings.
- **CSP `img-src` allows any `https:` source.** The map tile host is configured at runtime through `MAP_TILE_URL`, and the CSP is fixed at build time, so it cannot name the host. Scripts, styles, fonts and connections stay limited to the app itself.
- **`MAP_DEFAULT_CENTER` defaults to `0,20` with zoom `2`**, a neutral world view.
- **The desktop sidebar starts expanded.** It shows the organization name and the credit, which the icon rail cannot.
- **The account menu button shows a person icon**, because on phones the drawer button next to it already uses the three line menu icon.
- **The CLI is bundled with a second Vite config** (`vite.cli.config.ts`) into `build-cli/cli.js`. It reads the environment with the same Zod schema as the app; `npm run cli` loads the root `.env` for development.
- **`drizzle.config.ts` stays for `npm run db:studio` only.** It has no output folder; migrations are hand written.
- **Tests build their database URL from `POSTGRES_USER` and `POSTGRES_PASSWORD`** and always target `manifold_test` on `127.0.0.1:5432`, never `DATABASE_URL`, so no test can reach the development database or a remote one.
- **End to end tests run the production build (`node build`)**, not `vite preview`, so they cover adapter-node. Each test sends its own random `X-Forwarded-For` address (`ADDRESS_HEADER` and `XFF_DEPTH` are set for the test server), which keeps the sign in rate limiter from carrying over between tests. The tests run one at a time because they share one database and one owner.
- **Integration tests that create tables work in a schema of their own** (`test_<random>`, with `public` still on the search path for the extensions), so they never disturb the seeded schema other tests read.
- **Migration checksums ignore line endings, and the repository forces LF** (`.gitattributes`). A Windows checkout with CRLF and the Linux image would otherwise disagree about files that did not change, and the app would refuse to start.

### Phase 2: Email templates

- **A browser counts as new when its user agent hash is not in `known_user_agent`.** Sessions disappear on sign out and audit events expire, so neither can tell whether a browser was seen before. The table keeps only a SHA-256 hash of the user agent, per user.
- **Codes and notices are sent without awaiting the SMTP server.** Better Auth advises this for codes, so response timing reveals nothing; notices must never delay or fail a sign in or a password change. Failures are logged without the mail content.
- **Code mails end with the ignore notice, notices with the reason they were sent.** "If you did not ask for this code" does not fit a notice about a password change.
- **Mail times are shown in UTC with the zone name.** The server does not know the owner's time zone, and an unmarked local time would mislead.
- **The development preview is a `+server.ts` route** that returns one HTML page per template with both locales, each as an `srcdoc` iframe next to its text part. It answers `404` outside development.
