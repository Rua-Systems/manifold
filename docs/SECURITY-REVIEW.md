# Security Review

This review checks Manifold against the [OWASP Application Security Verification Standard (ASVS) 5.0.0](https://owasp.org/www-project-application-security-verification-standard/), levels 1 and 2. It was completed on 30 September 2026. Five reviewers read the code, the Better Auth sources it relies on and the documentation, one group of chapters each; the findings were then fixed or decided, and every fix was checked in the code.

Every one of the 253 level 1 and level 2 requirements is listed in [Requirement results](#requirement-results) with one of these results:

- **Pass**: the application met the requirement before the review.
- **Fixed**: the review found a gap, and it was closed with code and tests or with documentation.
- **Accepted**: the review found a gap that stays open on purpose; the reason is given in the notes and in [Accepted deviations](#accepted-deviations).
- **Not applicable**: the requirement concerns a technology or feature that Manifold does not have; the reason is given.

No finding is open. The deviations the review accepts on purpose are explained in [Accepted deviations](#accepted-deviations).

| Result         | Level 1 | Level 2 | Total   |
| -------------- | ------- | ------- | ------- |
| Pass           | 48      | 65      | 113     |
| Fixed          | 8       | 47      | 55      |
| Accepted       | 1       | 8       | 9       |
| Not applicable | 13      | 63      | 76      |
| **Total**      | **70**  | **183** | **253** |

## Findings fixed in this review

Browser and HTTP:

1. `redirectTo` was checked as a string only, so a target such as `/<tab>/evil.example` passed and browsers read it as another host. `safeRedirectTarget` in `src/lib/utils/redirect.ts` now parses the target with `new URL` against a placeholder origin, the way a browser does, and falls back unless it stays on that origin (V3.7.2).
2. Static build files are served by adapter-node before the SvelteKit hooks run and missed every security header. The image now starts `build/server.js`, built from `src/server.ts`, which sets `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `X-Robots-Tag`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, a Content Security Policy that allows nothing, and HSTS when `ORIGIN` is `https`, on every response, and refuses `TRACE`, `TRACK` and `CONNECT` with 405 (V3.4.1, V3.4.4, V13.4.4, V3.4.3, V3.4.6; the sandbox policy of uploaded files gained `base-uri 'none'` and `frame-ancestors 'none'` as well).
3. `applySecurityHeaders` in `src/lib/server/security-headers.ts`, called by `handleSecurityHeaders`, completes every rendered response: a page's own policy stays, anything without a cache policy gets `Cache-Control: no-store`, and text, JSON, XML and SVG types get `charset=utf-8` (V4.1.1, V14.2.2, V14.3.2).
4. The page policy used `base-uri 'self'`; it is now `base-uri 'none'` (`vite.config.ts`, part of V3.4.3).
5. Signing out answers with `Clear-Site-Data: "cache", "storage"`, which also removes the last map view from `localStorage` (V14.3.1, V14.3.3).

Authentication and sessions:

1. New passwords are refused when they are among the SecLists common passwords (the 10,000 most common, plus the 43,940 entries of 12 to 128 characters of the million most common) or contain the product name, the organization name, the username or the email address. This covers the password change, the reset by emailed code, `owner:reset-password` and the first owner from `OWNER_PASSWORD` (`src/lib/server/passwords/policy.ts`; V6.1.2, V6.2.4, V6.2.11, V6.2.12).
2. Passwords are hashed with scrypt at N = 2^15, r = 8, p = 3 in the self-describing format `$scrypt$ln=15,r=8,p=3$<salt>$<key>` (`src/lib/server/passwords/hash.ts`), configured as Better Auth's `hash` and `verify`. Hashes in Better Auth's default format still verify and are replaced at the next sign-in with the password (`upgradeOwnerPasswordHash` in `owner.ts`; V11.4.2, V11.2.2).
3. The Security page actions, the password change and step-up checked the password and TOTP codes without any limit, so a stolen session could guess at full speed. Five wrong answers per minute per account now block further checks from any address (`isCredentialCheckBlocked` and `countFailedCredentialCheck` in `src/lib/server/rate-limit.ts`); step-up keeps its limit per address as well (V6.3.1, V2.4.1).
4. A TOTP code is accepted only once: `src/lib/server/totp-replay.ts` refuses a used code for two minutes, at sign-in, step-up, two-factor setup, disabling and new backup codes (V6.5.1).
5. Backup codes have 120 bits (10 codes of 24 base32 characters from `src/lib/server/backup-codes.ts`) instead of about 60 (V6.5.2, entropy part).
6. Emailed codes are stored hashed (`storeOTP: 'hashed'` for the sign-in and reset codes and for the emailed second factor), Better Auth's telemetry is off, and Better Auth reads the client address from an internal header that `handleSession` fills with adapter-node's trusted address (`CLIENT_ADDRESS_HEADER` in `src/lib/server/auth.ts`; V15.3.4, V13.1.1).
7. Ending one session or all other sessions needs a step-up (`revokeSession` and `revokeOtherSessions` in `src/routes/(app)/settings/security/+page.server.ts`, `SessionList.svelte`; V7.5.2).
8. Sessions end 30 days after the sign-in at the latest (`isPastMaximumAge` and `endSession` in `src/lib/server/sessions.ts`, applied in `handleSession` and audited as `auth.session_expired`), and `/login` sends a signed-in visitor back into the app instead of starting a second session (V7.3.2, V7.2.4).

Input, files and business limits:

1. Missing bounds were added: passwords at most 1,024 characters on input, email addresses 254, service and vault addresses 2,048, the step-up code 32, the TOTP setup address 1,024, note and revision versions at most 2,147,483,647 (400 instead of 500), and real calendar days for the API key expiry and the audit filter (`isCalendarDate` in `src/lib/schemas/rules.ts`; V2.2.1, V1.4.2).
2. Editor image uploads are limited to 30 per minute per account, only one export runs at a time (429 otherwise), and `/files/<id>` requests with an API key count against the key's rate limit (V2.4.1, V15.2.2).
3. SVG service icons must be valid UTF-8 and may not contain `script`, `foreignObject`, `iframe`, `embed`, `object`, `handler`, `audio` or `video` elements, `on*` attributes, entity declarations, or `href` and `url()` references other than `#fragments` and `data:image` values (`src/lib/server/files/detect.ts`; V1.3.4).
4. A restore accepts only `manifest.json`, `database.dump` and `uploads/<name>` as regular files and stops on anything else; only the uploads that the restored `file` records name are copied, and the others are left out and reported. Before unpacking, the archive's entries are counted and their sizes added up, and an archive with more than a million entries or more bytes than the free space is refused (`restoreBackup` and `checkArchiveSize` in `src/lib/server/backup/backup.ts`; V5.1.1, V5.2.2, V5.2.3).

Cryptography, communication and operations:

1. SMTP requires TLS 1.2 or newer with certificate checks, except for a relay on the same machine (`requiresTls` in `src/lib/server/services/mail/transport.ts`), and an external database must use `sslmode=verify-full` ([Configuration](configuration.md#database); V12.3.1, V12.3.2).
2. The vault's AES-GCM tag length is pinned to 16 bytes (`AUTH_TAG_BYTES` in `src/lib/modules/vault/crypto.server.ts`; V11.3.3).
3. The application log is structured: `src/lib/server/log.ts` writes one JSON object per line with time and level, every audit event is mirrored to it, security events (missing and invalid keys, refused scopes, rate limits, blocked credential checks, cross-site forms, oversized bodies, rejected uploads) are logged at `warn`, and `handleError` logs unexpected errors with an id and the route and returns the id. Request paths are no longer used as format strings, and wrong password reset codes are audited as `auth.password_reset_failed` (V1.3.10, V16.2.1, V16.2.4, V16.3.1, V16.3.2, V16.3.3, V16.4.3).
4. The audit log is append-only: migration `0012_core_audit_append_only.sql` adds triggers that refuse `UPDATE`, `DELETE` and `TRUNCATE` unless the transaction sets `manifold.audit_purge`, which only the retention task does (V16.4.2).
5. Secrets can come from files (`DATABASE_URL_FILE`, `BETTER_AUTH_SECRET_FILE`, `ENCRYPTION_KEY_FILE`, `OWNER_PASSWORD_FILE`, `SMTP_PASSWORD_FILE`), and the example database password `change-me` is refused when `ORIGIN` is `https` (`src/lib/server/env.ts`; V13.3.1, V13.2.3).
6. The runtime packages are `dependencies` now, so the CycloneDX SBOM in the image lists them; `npm audit` fails CI on high and critical findings, Dependabot proposes updates weekly, and overrides fix the advisories in `cookie` and `esbuild` (V15.1.2).
7. The documentation that ASVS asks for was added to [Security](security.md) (limits, session policy, cryptography and key management, data classification, connections, the rationale for optional two-factor authentication) and is summarized in the sections below. [Deployment](deployment.md) now refuses plain HTTP requests that carry an `Authorization` header in the Caddy and Nginx examples and sets modern `ssl_ciphers`, and [REST API](api.md) and [MCP server](mcp.md) tell clients to use `https` (V2.1.3, V4.1.2, V6.1.2, V7.1.1, V7.1.2, V8.1.2, V11.1.1, V11.1.2, V12.1.2, V13.1.1, V14.1.1, V14.1.2, V14.2.4, V15.1.3).

The container was already hardened before the review: it runs as the unprivileged `node` user with a read-only root filesystem, no Linux capabilities, `no-new-privileges`, a health check, and `TMPDIR` on the data volume.

## Accepted deviations

1. **No `__Host-` cookie prefix (V3.3.1, V3.3.3).** Better Auth names its cookies `__Secure-better-auth.*`; they are `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/` and have no `Domain`. Renaming them to `__Host-` would need a translation layer on every request and response. The prefix mainly stops a sibling subdomain from planting a cookie, which is a low risk for an instance on its own host name. The preference cookies `manifold_theme` and `manifold_sidebar` carry no prefix and no security meaning; the sidebar cookie is written `Secure` over `https`, and SvelteKit sets the theme cookie `Secure` and `HttpOnly`.
2. **Plain HTTP API requests behind Coolify are redirected (V4.1.2).** The Caddy and Nginx examples refuse plain HTTP requests to `/api/`, `/mcp` and with an `Authorization` header, but Coolify's own proxy redirects every path to `https`. The documentation tells operators and clients to use `https` addresses.
3. **Uploads are not scanned for viruses (V5.4.3).** Only images recognized from their bytes are accepted, SVG icons must pass the checks above, and files are served only to the owner and `files:read` keys with the detected type, `nosniff` and a sandboxing Content Security Policy, so a browser never runs them. A virus scanner would add a service to every installation of a single-owner app whose files come from the owner and the owner's own programs.
4. **Two-factor authentication is optional (V6.3.3).** Manifold has one account, set up by the person who runs the server, so there is nobody to enforce it on. The owner is told to turn it on, and the mitigations are listed in [Authentication pathways and controls](#authentication-pathways-and-controls) and in [Security](security.md#two-factor-authentication).
5. **Backup codes are stored encrypted, not hashed (V6.5.2).** Better Auth shows the backup codes once after setup by reading them from its own store, so it keeps them encrypted with a key derived from `BETTER_AUTH_SECRET`. With 120 bits each, a plain hash would be allowed, but storing them that way would mean replacing Better Auth's two-factor store.
6. **`BETTER_AUTH_SECRET` has no versioned rotation (V11.2.2).** Rotating it is a documented procedure: turn two-factor authentication off, set the new secret and restart, then set up two-factor authentication again. The password hash format, the vault key and API keys can all be changed without such a step.
7. **The app uses the database superuser with a password (V13.2.1, V13.2.2).** The app connects to PostgreSQL as the `POSTGRES_USER` that the `postgis/postgis` image creates, with a random password in `DATABASE_URL`. The database publishes no port and is reachable only on Compose's own network. A separate role without superuser rights, or certificate authentication, would add an operations step to every installation.

## Authentication pathways and controls

| Pathway                                 | Users                          | Factors                                                                                                                                          | Controls                                                                                                                                                                                                                                                                |
| --------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign-in at `/login`                     | The owner                      | Username or email address with the password, or a six-digit emailed code; then a TOTP code or a backup code when two-factor authentication is on | 5 attempts per minute and client address, 3 code requests per minute; the second step must finish within ten minutes, allows 5 wrong codes and locks for 15 minutes after 10; identical answers for unknown accounts; every success and failure audited with the method |
| Password reset at `/forgot-password`    | The owner                      | Six-digit emailed code, valid for five minutes                                                                                                   | 3 wrong tries per code, the sign-in limit per address; never signs in, ends every session, and two-factor authentication still applies at the next sign-in                                                                                                              |
| Step-up confirmation                    | The signed-in owner            | Password, plus a TOTP code when two-factor authentication is on                                                                                  | 5 attempts per minute and address, 5 wrong answers per minute and account; valid ten minutes for the current session; codes are single use; failures audited                                                                                                            |
| REST API at `/api/v1` and MCP at `/mcp` | Programs of the owner          | API key of 32 random bytes in the `Authorization` header                                                                                         | Scopes per module, optional expiry, immediate revocation, `API_RATE_LIMIT_PER_MINUTE` per key; created only after a step-up                                                                                                                                             |
| Shared note at `/shared` (since 0.5.0)  | Whoever the owner gives a link | Note token of 32 random bytes, from the link's fragment into an `HttpOnly`, `SameSite=Strict` cookie, or as a Bearer key                         | One note, read or edit, a required expiry, immediate revocation; 10 openings per minute and address, `API_RATE_LIMIT_PER_MINUTE` per token; created only after a step-up                                                                                                |
| Command line inside the container       | Operators with shell access    | Access to the server                                                                                                                             | Not reachable over the network; `owner:reset-password` and `owner:disable-2fa` end every session and write audit entries                                                                                                                                                |

The account is created once from `OWNER_USERNAME`, `OWNER_EMAIL` and `OWNER_PASSWORD`; sign-up is off, and a database hook refuses a second user. Better Auth's HTTP handler is not mounted, so every step runs through a SvelteKit form action that calls `auth.api` on the server, and only the pathways above exist.

The sign-in limit is per client address and there is deliberately no account lockout: a lockout would let anybody who knows the owner's address lock the owner out. Within a signed-in session, wrong passwords and codes are counted per account instead, so a stolen session cookie cannot be used to guess.

Password policy:

- 8 to 128 characters, no composition rules, no expiry. Paste and password managers work, and fields carry `autocomplete` hints.
- Refused when found in the bundled lists, compared without letter case: the 10,000 most common passwords and the 43,940 passwords of 12 to 128 characters from SecLists' list of the million most common.
- Refused when it contains a context-specific word, compared without letter case: `manifold`, the value of `ORGANIZATION_NAME` and each of its words, the owner's username, and the email address and its local part. Words shorter than four characters are ignored.
- Hashed with scrypt, N = 2^15, r = 8, p = 3, 16-byte salt, 64-byte key, after Unicode NFKC normalization.

Two-factor authentication uses RFC 6238 TOTP (HMAC-SHA1, six digits, 30-second steps, one step of tolerance). An accepted code is refused for two minutes afterwards. Turning it on gives 10 backup codes of 24 base32 characters (120 bits), each usable once. When the authenticator and the backup codes are lost, `owner:disable-2fa` on the server turns two-factor authentication off.

Multi-factor authentication (V6.3.3). Two-factor authentication is optional because the single owner also runs the server. The mitigations while it is off:

- The password policy refuses short, common, breached and context-based passwords, and passwords are hashed at OWASP's recommended cost.
- Online guessing is limited per client address at sign-in and per account within a session.
- A sign-in from a browser Manifold has not seen before, and every password change, is announced by email when email is set up.
- Sensitive actions (email, password, API keys, vault values, the export, ending sessions) need a fresh step-up.
- Sessions end after seven idle days and 30 days at the latest, the owner sees and ends them, and every sign-in and failure is in the audit log.

## Sessions

- Sessions are Better Auth reference tokens of 32 random characters (about 190 bits), looked up in the database on every request. The cookie cache is off.
- Over `https`, the cookie is `__Secure-better-auth.session_token`: `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, no `Domain`.
- Inactivity timeout: 7 days. Activity extends the session at most once a day.
- Absolute lifetime: 30 days after the sign-in, whatever the activity; the ending is audited as `auth.session_expired`.
- Concurrent sessions are not limited. **Settings → Security** lists them with device, address, sign-in time and last activity, and ends one or all others after a step-up.
- Sessions end on sign-out, for the other sessions when the password is changed, for every session on a password reset and with `owner:reset-password` and `owner:disable-2fa`, and when they reach the absolute lifetime.
- A step-up does not replace the session: it is a row in `session_step_up` tied to the session id, valid for ten minutes and deleted with the session. The token is `HttpOnly`, set only by the server and never read from a URL, so there is no fixed token an attacker could plant and later use.

Deviation from NIST SP 800-63B (V7.1.1): at AAL2, NIST asks for re-authentication after a short period of inactivity and at least every 12 to 24 hours. Manifold keeps the owner signed in for up to 7 idle days and 30 days overall, because it is a personal tool used every day from one or two devices. Every change that could take over the account or reveal secrets asks for a fresh step-up instead, and the controls above apply.

## Authorization

Manifold has a single owner, so there are no roles and no objects of other users. Authorization decides between the owner's session, API keys with scopes and anonymous visitors:

| Caller                    | May reach                                                                                                                                                                                           | Enforced by                                                                                                                                                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Anonymous visitor         | `/login`, `/forgot-password`, the theme switch, `/healthz`, the static build files                                                                                                                  | `guardRequest` in `src/lib/server/guard.ts` redirects page requests in the `(app)` group to sign in and answers every other request with `401`                                                   |
| The owner's session       | Every page, data load and form action; `/files/<id>`; the export                                                                                                                                    | `guardRequest` for the `(app)` group and `requireUser` in loads and actions                                                                                                                      |
| The owner after a step-up | Email and password changes, API key creation, revealing, copying and changing vault values, the export, ending sessions                                                                             | `isSteppedUp` in `src/lib/server/step-up.ts`, a row per session valid for ten minutes                                                                                                            |
| API key                   | `/api/v1` routes of its scopes, the MCP tools of its scopes, `/files/<id>` with `files:read`                                                                                                        | `handleApiRequest` in `src/lib/server/api/router.ts` checks the key, the rate limit and `route.scope`; `buildServer` in `src/lib/server/mcp/server.ts` registers only the tools the scopes allow |
| Note token (since 0.5.0)  | `/shared` for its note; `GET /api/v1/me`, `GET` and, with edit access, `PATCH /api/v1/notes/{id}` of its note; `get_note` and `update_note` on its note; `/files/<id>` of the images its note shows | `assertNoteGrant` in `src/lib/server/api/credentials.ts` for routes and tools marked `noteToken`, `noteTokenMaySee` for the tool list, `noteShowsFile` in `src/routes/files/[id]/+server.ts`     |
| Operator                  | The command line inside the container                                                                                                                                                               | Shell access to the server                                                                                                                                                                       |

Scopes are per module (`services`, `notes`, `map`, `vault`, `files`) and a write scope does not include the read scope. Data and field-level rules (V8.1.2):

- `vault:read` sees names, addresses and descriptions only; no route and no MCP tool returns or accepts a vault value.
- `map:read` sees the title of the note a feature is linked to; `map:write` may create that note together with the feature and may link a feature to any note outside the trash.
- The server alone sets note versions, revision actors, the vault's `key_version` and `last_revealed_at`, API key hashes, prefixes, `last_used_at` and scopes after creation; no form or route accepts them.
- Trashed notes cannot be changed and their map features are left out; unknown ids answer `404`.

## Input validation and business limits

Every input is parsed on the server with a Zod schema: form fields, JSON bodies, route and query parameters and environment variables. Invalid input stops the action with a field error or a `400`.

| Data                        | Rule                                                                                                                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Identifiers                 | UUIDs, checked with `isUuid` before they reach SQL or the file store                                                                                                                                                     |
| Usernames and display names | Usernames 3 to 32 characters of `a-z`, `0-9`, `.`, `_` and `-`; display names at most 100 characters                                                                                                                     |
| Email addresses             | Valid address syntax, at most 254 characters                                                                                                                                                                             |
| Passwords                   | New passwords 8 to 128 characters and the policy in [Authentication pathways and controls](#authentication-pathways-and-controls); any password field accepts at most 1,024 characters                                   |
| Codes                       | Emailed codes six digits; the step-up code at most 32 characters; the TOTP setup address must start with `otpauth://totp/` and have at most 1,024 characters                                                             |
| Notes                       | Title at most 200 characters; content is editor JSON of at most 2 MB, rebuilt against the editor schema, with links limited to `http`, `https` and `mailto` and images to `/files/<uuid>`; Markdown input drops raw HTML |
| Map features                | GeoJSON geometries of at most 10,000 points, checked by Zod and PostGIS                                                                                                                                                  |
| Services                    | Alias at most 60 characters; address `http` or `https`, at most 2,048 characters                                                                                                                                         |
| Vault entries               | Name 100, description 500 and value 10,000 characters; address `http` or `https`, at most 2,048 characters                                                                                                               |
| API keys                    | Name at most 100 characters; scopes from the allowlist of module scopes; expiry a real calendar day, not in the past                                                                                                     |
| Versions                    | Whole numbers from 1 to 2,147,483,647                                                                                                                                                                                    |
| Query parameters            | `limit` up to 100 per page, cursors validated with Zod, search terms up to 200 characters and up to 50 hits, audit filter dates real calendar days                                                                       |
| Uploads                     | See [File handling](#file-handling)                                                                                                                                                                                      |
| Environment                 | Checked on start; errors name the variable, never the value                                                                                                                                                              |

Rules for combined values (V2.1.2): `content` or `markdown` but never both; `note_id` or a new `note` but not both; a map feature keeps its geometry kind; a note change must name the stored `version`; a service order lists every service exactly once; a password must match its confirmation; notes are deleted for good only from the trash.

Limits (V2.1.3):

| Limit                                           | Scope           | Value                                                        |
| ----------------------------------------------- | --------------- | ------------------------------------------------------------ |
| Sign-in attempts (password, codes, resets)      | Client address  | 5 per minute                                                 |
| Requests for emailed codes                      | Client address  | 3 per minute                                                 |
| Step-up confirmations                           | Client address  | 5 per minute                                                 |
| Wrong passwords or codes in a signed-in session | Account         | 5 per minute, then refused until the minute is over          |
| Second step of a sign-in                        | Sign-in attempt | 5 wrong codes; locked for 15 minutes after 10                |
| REST, MCP and file requests with a key          | API key         | `API_RATE_LIMIT_PER_MINUTE`, 120 per minute by default       |
| Image uploads from the editor                   | Account         | 30 per minute                                                |
| Data exports                                    | Installation    | One at a time                                                |
| Upload size                                     | Request         | `UPLOAD_MAX_BYTES`, 100 MB by default; images 10 MB at most  |
| Other request bodies                            | Request         | 5 MB; a chunked body without a length is refused             |
| Trash and audit log                             | Installation    | `TRASH_RETENTION_DAYS` (30) and `AUDIT_RETENTION_DAYS` (180) |

The number of notes, files, vault entries and keys is bounded only by the disk. The counters live in the app's memory and start over when it restarts.

## File handling

Uploads (note images, service icons and `POST /api/v1/files`):

- Note images: PNG, JPEG, WebP and GIF, recognized by their magic bytes; service icons may also be SVG. API uploads: any file. Its type comes from its magic bytes (images, PDF, audio, video), or from a text extension together with UTF-8 content without NUL bytes; SVG is checked whole like an icon. Any other file is stored as `application/octet-stream`. File names and the type the client claims are never trusted.
- SVG icons must be valid UTF-8 and may not contain scripts, embedded documents, event handlers, entity declarations or references to other addresses.
- At most `UPLOAD_MAX_BYTES` per file, checked before the body is read (`checkBodySize`) and again while it streams to disk (`receiveUploads` in src/lib/server/files/upload-stream.ts, a parser limit that stops the file and removes it); images stay under 10 MB (`imageMaxBytes`). Files are never decoded or run on the server.
- Files are stored under generated UUIDs in `UPLOAD_DIR` and served only by `/files/<id>` and `GET /api/v1/files/{id}`, to the owner and to keys with `files:read`, with the detected type, `nosniff`, `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox` and a cleaned file name: `Content-Disposition: inline` for images, PDF, audio, video and text, and `attachment` with `application/octet-stream` for anything else (`serveFile`). Single byte ranges are answered with `206`. Files that nothing refers to any more are deleted by the daily housekeeping.

Restore archives (command line only):

- `.tar.gz` files that may hold only `manifest.json`, `database.dump` and `uploads/<name>` as regular files; any other entry, a link or a folder of its own included, stops the restore before the database is touched. node-tar runs in strict mode, which strips absolute paths and refuses `..`.
- Only restored uploads whose names the restored `file` records hold are copied; the others are left out and reported.
- Archives from newer versions of Manifold are refused. The dump is applied as it is, so the documentation asks operators to restore only archives they made.

## Cryptography

| Purpose                              | Algorithm and parameters                                                                     | Key or secret                               | Stored as                                                                                              |
| ------------------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Password hashing                     | scrypt, N = 2^15, r = 8, p = 3, 16-byte salt, 64-byte key                                    | None                                        | `$scrypt$ln=15,r=8,p=3$<salt>$<key>`                                                                   |
| Earlier password hashes              | Better Auth scrypt, N = 2^14, r = 16, p = 1                                                  | None                                        | Verified and replaced at the next password sign-in                                                     |
| Vault values                         | AES-256-GCM, random 12-byte IV, 16-byte tag, entry id as additional data                     | `ENCRYPTION_KEY`, 32 bytes                  | Ciphertext, IV, tag and key version per entry                                                          |
| Session and second-factor cookies    | HMAC-SHA256 (Better Auth)                                                                    | `BETTER_AUTH_SECRET`                        | Signature in the cookie                                                                                |
| TOTP secret and backup codes at rest | XChaCha20-Poly1305 (Better Auth), key SHA-256 of the secret                                  | `BETTER_AUTH_SECRET`                        | Ciphertext                                                                                             |
| API keys                             | 32 random bytes, SHA-256, constant-time comparison                                           | None                                        | Hash and an 8-character prefix; a vault entry, encrypted as above, only when the owner asks for a copy |
| Emailed codes                        | Six random digits, SHA-256 (Better Auth `storeOTP: 'hashed'`)                                | None                                        | Hash                                                                                                   |
| Backup codes                         | 24 base32 characters, 120 bits                                                               | None                                        | Encrypted, see above                                                                                   |
| TOTP codes                           | RFC 6238, HMAC-SHA1, six digits, 30 seconds                                                  | Per-owner TOTP secret                       | Encrypted, see above                                                                                   |
| Browser fingerprints for notices     | SHA-256 of the user agent                                                                    | None                                        | Hash                                                                                                   |
| Random values                        | Node.js `crypto` (`randomBytes`, `randomInt`, `randomUUID`) and Web Crypto `getRandomValues` |                                             |                                                                                                        |
| Transport                            | TLS 1.2 or 1.3 at the reverse proxy; SMTP with TLS 1.2 or newer and certificate checks       | Proxy certificate; system CA store for SMTP |                                                                                                        |

`BETTER_AUTH_SECRET` and `ENCRYPTION_KEY` are the only long-term keys. Their lifecycle, following NIST SP 800-57:

- Generation: by the operator with `openssl rand -base64 32`. The app refuses a `BETTER_AUTH_SECRET` shorter than 32 characters and an `ENCRYPTION_KEY` that does not decode to exactly 32 bytes.
- Storage and distribution: in the environment or in a file named by `BETTER_AUTH_SECRET_FILE` or `ENCRYPTION_KEY_FILE`, such as a Docker secret, with a copy in the operator's password manager. Neither is logged, written to the database or part of a backup, and only the app process reads them.
- Use: `BETTER_AUTH_SECRET` signs cookies and encrypts the TOTP secret and backup codes; `ENCRYPTION_KEY` encrypts vault values and nothing else.
- Rotation: `node cli.js vault:rotate-key` encrypts every vault value again with a new key in one transaction. `BETTER_AUTH_SECRET` is rotated by turning two-factor authentication off, setting the new secret and restarting, which ends every session, and setting two-factor authentication up again (see [Accepted deviations](#accepted-deviations)).
- Destruction: remove retired values from the environment, secret stores and copies of `.env`. Keep an old `ENCRYPTION_KEY` only as long as backups made with it may need restoring.

Password hashes and vault entries name their parameters or key version, so parameters and keys can change without breaking stored data.

## Communication

| Connection                               | Protocol                                                                                                  | Initiated by                                        |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Browsers, API and MCP clients to the app | HTTPS to the reverse proxy, then HTTP to port 3000 on `127.0.0.1` or the proxy's network on the same host | Users and their programs                            |
| App to PostgreSQL                        | PostgreSQL protocol on Compose's network, not published                                                   | The app                                             |
| App to the SMTP server (optional)        | SMTPS or SMTP with required STARTTLS, TLS 1.2 or newer; plain SMTP only to a relay on the same machine    | The app, for sign-in codes, reset codes and notices |
| Browsers to the map tile server          | HTTPS to `MAP_TILE_URL`, OpenStreetMap by default                                                         | The browser                                         |
| Health check                             | HTTP to `127.0.0.1` inside the container                                                                  | The container runtime                               |
| GitHub Actions to Coolify (optional)     | HTTPS call of the deploy webhook                                                                          | The release workflow                                |

The server never fetches the addresses users enter for services, and it makes no other outgoing connections: no telemetry, no update checks, and fonts and scripts come from Manifold itself.

## Data protection

| Class       | Data                                                                                                                                                              | Protection                                                                                                                                                      |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Secret      | Vault values, passwords, API keys, emailed codes, the TOTP secret, backup codes, session tokens, `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY`, the SMTP password        | Encrypted or hashed at rest; shown at most once or only after a step-up; never in API answers, audit entries or logs; responses `no-store`                      |
| Private     | Notes and revisions, map features, services, uploaded files, vault names and descriptions, settings, the audit log, sessions with their addresses and user agents | Only for the owner and keys with the matching scope; stored in the database and the upload folder; in backups; trash and audit log purged after their retention |
| Operational | Application log, health status                                                                                                                                    | Without secrets or content; kept by the operator's log driver                                                                                                   |

Requirements for all classes:

- Integrity: multi-row writes run in one transaction, notes carry versions, and the audit log is append-only.
- Encryption at rest: vault values are encrypted by the app. The database and uploads are not; keep the volumes on an encrypted disk where that matters.
- Backups hold the secret and private classes in the form they are stored, so they need the same protection as the live data.
- Browser storage: cookies hold only the session, the second-factor challenge and UI preferences, and `localStorage` only the last map view, which `Clear-Site-Data` removes at sign-out.

## Resource-intensive functions

| Function          | Cost                                                 | Defenses                                                                                                                                  |
| ----------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Password hashing  | About 32 MiB and a noticeable amount of CPU per hash | Sign-in limit per address, credential limit per account, step-up limits; runs on the bounded libuv thread pool                            |
| Uploads           | Writing up to `UPLOAD_MAX_BYTES` to disk             | Body limits before the session is read, 30 editor uploads per minute and account, per-key rate limit for the API; files are never decoded |
| Data export       | `pg_dump` and reading every upload                   | Step-up, one export at a time; streamed, so the download starts at once                                                                   |
| Restore           | Unpacking and `pg_restore`                           | Command line only; at most one million entries and no more bytes than the free space, counted before unpacking                            |
| Search            | PostgreSQL full-text and trigram queries             | Terms up to 200 characters, at most 50 hits, per-key rate limit                                                                           |
| API and MCP lists | Database queries per page                            | At most 100 items per page with cursors, per-key rate limit; MCP is stateless with JSON answers                                           |
| Map features      | Geometries in PostGIS                                | At most 10,000 points per feature, paged lists                                                                                            |
| Email             | SMTP connections                                     | Sent in the background; a failure never blocks a request                                                                                  |
| Housekeeping      | Purging the trash, old audit events and unused files | A daily background task; a failing task does not stop the others                                                                          |

Every request finishes within bounded work, so no response needs longer than a client's usual timeout; the export streams its archive instead of building it first.

## Logging

| Log              | Written by                        | Content                                                                                                                                                            | Destination and access                                                                                                                   | Retention                                   |
| ---------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Application log  | The app (`src/lib/server/log.ts`) | One JSON object per line with ISO time in UTC, level and message: start-up, migrations, audit events, security events, unexpected errors with id, method and route | Standard output and standard error of the container; read by operators through Docker and shipped to a log system of their choice        | Set by the operator's log driver            |
| Audit log        | The app (`recordAudit`)           | Time, actor type and id, action, target, client address, user agent and details without secrets or content                                                         | `audit_event` table, append-only by triggers; shown to the owner under **Settings → Security** with filters; also in the application log | `AUDIT_RETENTION_DAYS`, 180 days by default |
| Proxy access log | The reverse proxy                 | Requests as configured by the operator                                                                                                                             | Operator                                                                                                                                 | Operator's choice                           |

Security events are written at level `warn` with the message `Security event` and the event name: `missing_key`, `invalid_key`, `insufficient_scope`, `rate_limited` (per address, key, account or the export), `credential_checks_blocked`, `cross_site_form`, `body_too_large`, `length_required` and `upload_rejected`, with the address, path or key id. Callers pass identifiers and outcomes only; passwords, codes, keys, cookies, secrets and the content of notes and the vault are never logged.

## Requirement results

### V1 Encoding and Sanitization

#### V1.1 Encoding and Sanitization Architecture

| ID     | Level | Result | Notes                                                                                                                                                                                                                                                                                                                                     |
| ------ | ----- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1.1.1 | 2     | Pass   | SvelteKit decodes the path once (a malformed escape is answered with 400 before any route runs) and forms and JSON bodies are decoded once by the Fetch API. The API router (`src/lib/server/api/router.ts`) decodes each path parameter once with `decodeURIComponent` before Zod validation; nothing is decoded again after validation. |
| V1.1.2 | 2     | Pass   | Svelte escapes every interpolation at render time and the app has no `{@html}`. Note content is stored as validated ProseMirror JSON and turned into DOM by ProseMirror in the browser. Mail HTML escapes each value where the template is assembled (`escapeHtml` in `services/mail/html.ts` and `layout.ts`).                           |

#### V1.2 Injection Prevention

| ID     | Level | Result         | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------ | ----- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1.2.1 | 1     | Pass           | Svelte templates encode for HTML text and attributes; `app.html` only receives the locale, the text direction and a theme from the allowlist in `parseTheme`. `Content-Disposition` for files is built by `contentDisposition` with an ASCII fallback that replaces quotes, backslashes and control characters and an RFC 5987 encoded name; other header values come from constants or validated identifiers. Mail HTML escapes every value.           |
| V1.2.2 | 1     | Pass           | Query strings are built with `encodeURIComponent` (`guard.ts`, step-up links, `AuditLog.svelte`, the command palette) and `redirectTo` is limited to local paths by `safeRedirectTarget`. Service addresses and vault addresses must be `http` or `https` (`serviceUrlSchema`, `optionalUrl`, DB check `url ~* '^https?://'`), and note links are limited to `http`, `https` and `mailto` by `isAllowedLink`, so `javascript:` and `data:` are refused. |
| V1.2.3 | 1     | Pass           | JSON is produced with `JSON.stringify` (`jsonResponse`, MCP tool results) or SvelteKit's serializer for load data, which escapes script-closing sequences. The only inline script in `app.html` is static and carries the CSP nonce; no JavaScript is assembled from data.                                                                                                                                                                              |
| V1.2.4 | 1     | Pass           | Queries go through Drizzle and postgres.js with bound parameters, including every `sql` template. `sql.raw` is used only with a numeric constant, `sql.unsafe` only for migration files from the image and for the CLI restore, which quotes schema names read from `pg_namespace`. LIKE patterns escape `%`, `_` and `\` (`containsPattern`, `escapeLike`) and tsquery input is reduced to letters and digits (`prefixQuery`).                         |
| V1.2.5 | 1     | Pass           | The only processes are `pg_dump` and `pg_restore` (and `docker compose` as a development fallback) in `backup/pg-tools.ts`, started with `spawn` and an argument array, never through a shell. Their arguments come from constants and `DATABASE_URL`, not from requests.                                                                                                                                                                               |
| V1.2.6 | 2     | Not applicable | No LDAP.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| V1.2.7 | 2     | Not applicable | No XPath or XML queries.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| V1.2.8 | 2     | Not applicable | No LaTeX; the math extension of the editor was left out (decisions.md, Phase 4).                                                                                                                                                                                                                                                                                                                                                                        |
| V1.2.9 | 2     | Pass           | Regular expressions are built only from constants: the API route patterns from the route definitions in code and `CODE_PATTERN` from `CODE_LENGTH`. User input is never compiled into a pattern.                                                                                                                                                                                                                                                        |

#### V1.3 Sanitization

| ID      | Level | Result         | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------- | ----- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1.3.1  | 1     | Pass           | The editor sends TipTap JSON, not HTML. `validateNoteContent` rebuilds it with ProseMirror's `Node.fromJSON` and `check()` against the shared schema, drops unknown attributes, refuses links outside `http`, `https` and `mailto` and images that are not `/files/<uuid>`, and caps it at 2 MB. Markdown input drops raw HTML before conversion.                                                                                             |
| V1.3.2  | 1     | Pass           | No `eval`, `new Function`, string timers or other dynamic code execution in `src`.                                                                                                                                                                                                                                                                                                                                                            |
| V1.3.3  | 2     | Pass           | Values that reach dangerous contexts are restricted first: ids are checked with `isUuid` before they reach SQL or file lookups, file names are cut to their base name without control characters and 200 characters (`cleanName`), storage keys are generated UUIDs, usernames follow `USERNAME_PATTERN`, and search input is escaped for LIKE and reduced for tsquery.                                                                       |
| V1.3.4  | 2     | Fixed          | Service icons may still be SVG, but `detectImageType` in `src/lib/server/files/detect.ts` now accepts an SVG only when it is valid UTF-8 and contains no `script`, `foreignObject`, `iframe`, `embed`, `object`, `handler`, `audio` or `video` element, no `on*` attribute, no entity declaration and no `href` or `url()` other than a `#fragment` or a `data:image` value (`detect.test.ts`). Note images and API uploads never accept SVG. |
| V1.3.5  | 2     | Pass           | Markdown from the API and MCP is converted into the same validated editor schema, with raw HTML dropped (`markdown.server.ts`, replaced `parseHTMLToken`). There is no user-supplied CSS, XSL, BBCode or template language.                                                                                                                                                                                                                   |
| V1.3.6  | 2     | Not applicable | The server makes no requests to addresses taken from input. Service addresses are only links, icons are uploaded rather than fetched, map tiles are loaded by the browser, and the SMTP host comes from the environment.                                                                                                                                                                                                                      |
| V1.3.7  | 2     | Pass           | Pages are compiled Svelte components, messages come from the compiled Paraglide catalogue and mails from fixed builders in `services/mail/templates.ts`; untrusted input is only ever data.                                                                                                                                                                                                                                                   |
| V1.3.8  | 2     | Not applicable | No JNDI.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| V1.3.9  | 2     | Not applicable | No memcache.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| V1.3.10 | 2     | Fixed          | `router.ts` used the request path in the format string of `console.error`. Log lines are now written by `log` in `src/lib/server/log.ts` as one `JSON.stringify` object passed as the only argument, and the method and path are fields, so input is never interpreted as a format.                                                                                                                                                           |
| V1.3.11 | 2     | Pass           | Mail goes only to the owner's stored, validated address; subjects come from translated templates with the organization name from the environment, and nodemailer encodes every header. `senderAddress` strips quotes from the display name.                                                                                                                                                                                                   |

#### V1.4 Memory, String, and Unmanaged Code

| ID     | Level | Result         | Notes                                                                                                                                                                                                                                                                                                           |
| ------ | ----- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1.4.1 | 2     | Not applicable | The application is TypeScript on Node.js, which is memory safe; it contains no unmanaged code.                                                                                                                                                                                                                  |
| V1.4.2 | 2     | Fixed          | Note and revision versions were unbounded and overflowed the `integer` column with a 500. `noteVersionSchema` and the API's `version` parameter and body field now stop at `VERSION_MAX` (2,147,483,647), so such a value answers 400. Other numbers (`limit`, bbox, coordinates, cursors) were bounded before. |
| V1.4.3 | 2     | Not applicable | No manual memory management; the runtime is garbage collected.                                                                                                                                                                                                                                                  |

#### V1.5 Safe Deserialization

| ID     | Level | Result         | Notes                                                                                                                                                                                                                                                                                                                                                                |
| ------ | ----- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1.5.1 | 1     | Not applicable | The application never parses XML; there is no XML parser among the dependencies, and SVG uploads are only recognized by a text pattern.                                                                                                                                                                                                                              |
| V1.5.2 | 2     | Pass           | Untrusted data is deserialized only with `JSON.parse` and then validated: cursors with Zod (`decodeCursor`), note content with the ProseMirror schema, geometries with Zod and PostGIS, and the sidebar cookie field by field (`parseSidebarPreferences`). Backup archives are read only by the command line, with `tar` in strict mode and an allowlist of entries. |

### V2 Validation and Business Logic

#### V2.1 Validation and Business Logic Documentation

| ID     | Level | Result | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------ | ----- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V2.1.1 | 1     | Pass   | The rules are documented, though spread over several pages: usernames, display names and passwords in `docs/account.md`, note titles and content in `docs/notes.md` and `docs/api.md`, geometries in `docs/api.md` and `docs/map-notes.md`, services and vault fields in `docs/services.md`, `docs/vault.md` and `docs/api.md`, uploads in `docs/security.md`, query parameters and API key names in `docs/api.md`, and the environment in `docs/configuration.md` ("Validation rules at a glance"). |
| V2.1.2 | 2     | Pass   | Rules for combined values are documented in `docs/api.md`, `docs/mcp.md` and `docs/decisions.md`: `content` or `markdown` but never both, `note_id` or a new `note` but not both, a geometry keeps its kind, `version` must match the stored version, the service order lists every id exactly once, a key's expiry date covers that day in UTC, and a password must match its confirmation.                                                                                                         |
| V2.1.3 | 2     | Fixed  | The limits per client address, per key, per account and per installation are now listed together in [Security](security.md#limits) and in [Input validation and business limits](#input-validation-and-business-limits), which also say that notes, files, vault entries and keys are bounded only by the disk.                                                                                                                                                                                      |

#### V2.2 Input Validation

| ID     | Level | Result | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------ | ----- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V2.2.1 | 1     | Fixed  | Input was already validated positively with Zod. The review added the missing bounds: passwords at most 1,024 characters on input (`PASSWORD_INPUT_MAX_LENGTH`), email addresses 254 (`EMAIL_MAX_LENGTH`), service and vault addresses 2,048 (`URL_MAX_LENGTH`), the step-up code 32, the TOTP setup address 1,024 (`setupFrom`), and real calendar days for the API key expiry and the audit filter (`isCalendarDate` in `src/lib/schemas/rules.ts`), which answered 500 for `2026-13-45` before. |
| V2.2.2 | 1     | Pass   | Validation runs on the server in every form action (Zod schemas in `src/lib/schemas` and the modules), in the API router (`parseWith` for params, query and body) and in the service functions the MCP tools share (`serviceSchema`, `validateNoteContent`, `mapGeometrySchema`). Client fields reuse the same schemas through `fromSchema` for usability only.                                                                                                                                    |
| V2.2.3 | 2     | Pass   | Related values are checked together on the server: password and confirmation (`passwordsMatch`), `baseVersion` against the stored version under `FOR UPDATE` (`updateNote`), the complete service order (`reorderServices`), content xor Markdown and note xor `note_id` in the API, the geometry kind on update, an expiry date that is not in the past, and permanent deletion only for notes in the trash.                                                                                      |

#### V2.3 Business Logic Security

| ID     | Level | Result         | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------ | ----- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V2.3.1 | 1     | Pass           | Multi-step flows keep their state on the server: the second factor is bound to Better Auth's signed `two_factor` challenge cookie with a ten-minute lifetime and an attempt counter, also after an emailed code (`email-code-two-factor.ts`); step-up is a row per session in `session_step_up` that sensitive actions check with `isSteppedUp`; TOTP setup is confirmed against the secret Better Auth stored, not the returned `totpUri`; the password reset needs the emailed code. |
| V2.3.2 | 2     | Pass           | The documented limits are enforced: `RATE_LIMITS` in `rate-limit.ts` (sign-in 5, code requests 3 and step-up 5 per minute and address; wrong credentials 5 and editor uploads 30 per minute and account), `API_RATE_LIMIT_PER_MINUTE` per key for REST, MCP and file downloads together, one export at a time, body and upload sizes in `body-limit.ts` and `storeUpload`, and field lengths through Zod and database check constraints.                                               |
| V2.3.3 | 2     | Pass           | Multi-row writes run in one transaction: note create and update with their revision and file links (`notes.server.ts`), a feature with its new note (`addFeatureWithNewNote`), the service order, owner bootstrap and recovery (`owner.ts`) and key rotation (`rotation.server.ts`). A failed upload row removes its bytes again. Audit entries are written after the change on purpose, so a failing audit write never blocks it (docs/security.md).                                  |
| V2.3.4 | 2     | Not applicable | There are no limited-quantity resources to book. Concurrent note edits are serialized by the version check under a row lock.                                                                                                                                                                                                                                                                                                                                                           |

#### V2.4 Anti-automation

| ID     | Level | Result | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------ | ----- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V2.4.1 | 2     | Fixed  | Sign-in, codes, resets, step-up and the API were limited before, but actions of a signed-in session were not. Now 5 wrong passwords or codes per minute block the Security page actions, the password change and step-up for the account (`isCredentialCheckBlocked`), editor image uploads are limited to 30 per minute per account (`isUploadLimited`), only one export runs at a time, and key requests to `/files/<id>` count against the key's rate limit. |

### V3 Web Frontend Security

#### V3.2 Unintended Content Interpretation

| ID     | Level | Result | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------ | ----- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V3.2.1 | 1     | Pass   | Uploads are served by `fileResponse` in `src/lib/server/files/files.ts` with the stored type, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox` and a generated disposition, so an SVG icon opened directly cannot run script. API and MCP answers are JSON with `nosniff` from the hook, and the export is sent as `attachment` (`src/routes/(app)/settings/data/export/+server.ts`). |
| V3.2.2 | 1     | Pass   | No `{@html}`, `innerHTML` or `insertAdjacentHTML` in `src`; Svelte renders text as text nodes and note content goes through the Tiptap/ProseMirror schema, which the server also validates. The only HTML string inserted is `MAP_TILE_ATTRIBUTION`, which OpenLayers renders and which comes from the operator's environment, not from users.                                                                                                            |

#### V3.3 Cookie Setup

| ID     | Level | Result   | Notes                                                                                                                                                                                                                                                                                                                                                                            |
| ------ | ----- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V3.3.1 | 1     | Accepted | Better Auth's cookies are `Secure` with the `__Secure-` prefix over `https`. The preference cookies carry no prefix: `manifold_theme` is `Secure` through SvelteKit's `cookies.set`, and `manifold_sidebar` is now written with `secure` over `https` (`sidebar.svelte.ts`); both hold only UI preferences. See [Accepted deviations](#accepted-deviations).                     |
| V3.3.2 | 2     | Pass     | Every cookie is `SameSite=Lax`: the session and challenge cookies by Better Auth's default, the theme cookie in `theme/+page.server.ts`, the sidebar cookie in `sidebar.svelte.ts`. Lax blocks cross-site form posts while links into the app keep working; state changes are POST only (V3.5.3).                                                                                |
| V3.3.3 | 2     | Accepted | No cookie uses the `__Host-` prefix. Better Auth's cookies are `__Secure-`, `HttpOnly`, `SameSite=Lax`, `Path=/` and without `Domain`; none is meant for other hosts. See [Accepted deviations](#accepted-deviations).                                                                                                                                                           |
| V3.3.4 | 2     | Pass     | The session token and the two-factor challenge are `HttpOnly` and only travel in `Set-Cookie`: Better Auth's HTTP handler is not mounted, the login actions return only form state, and the root layout returns `toSessionUser(locals.user)`, never the session. `manifold_theme` is `HttpOnly`; `manifold_sidebar` is script-readable on purpose and holds only UI preferences. |

#### V3.4 Browser Security Mechanism Headers

| ID     | Level | Result | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------ | ----- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V3.4.1 | 1     | Fixed  | The image now starts `build/server.js` (`src/server.ts`), which sets `Strict-Transport-Security: max-age=31536000; includeSubDomains` on every response when `ORIGIN` is `https`, including the static build files that adapter-node's `sirv` serves before the SvelteKit hooks run.                                                                                                                                                              |
| V3.4.2 | 1     | Pass   | The application sends no `Access-Control-Allow-Origin` at all: no code in `src` sets CORS headers and the MCP SDK transport (`WebStandardStreamableHTTPServerTransport`) adds none. Cross-origin browser reads of the API are therefore refused, which suits a Bearer key API.                                                                                                                                                                    |
| V3.4.3 | 2     | Fixed  | Pages send a nonce-based policy with `object-src 'none'` and `base-uri 'none'` (`vite.config.ts`). Every other response, static files included, gets `default-src 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'` from `src/server.ts` and `applySecurityHeaders`, and uploaded files keep their sandbox policy, now with `base-uri 'none'` and `frame-ancestors 'none'` (`fileResponse` in `src/lib/server/files/files.ts`). |
| V3.4.4 | 2     | Fixed  | `X-Content-Type-Options: nosniff` was missing on the static build files. `src/server.ts` now sets it on every response, including scripts, styles, icons and `robots.txt`.                                                                                                                                                                                                                                                                        |
| V3.4.5 | 2     | Pass   | `Referrer-Policy: strict-origin-when-cross-origin` is on every response, since the review also on static files, so other sites, the tile server included, see at most the origin. No address carries a secret: sign-in and reset use typed codes, and service links open with `noopener,noreferrer`.                                                                                                                                              |
| V3.4.6 | 2     | Fixed  | Pages send `frame-ancestors 'none'`, every other response gets it through the default policy of `src/server.ts` and `applySecurityHeaders`, and the sandbox policy of `/files/<id>` now carries it too, next to `X-Frame-Options: DENY`.                                                                                                                                                                                                          |

#### V3.5 Browser Origin Separation

| ID     | Level | Result         | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------ | ----- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V3.5.1 | 1     | Pass           | `handleCsrf` in `src/hooks.server.ts` refuses every POST, PUT, PATCH or DELETE with a form content type (`application/x-www-form-urlencoded`, `multipart/form-data`, `text/plain`) whose `Origin` is not exactly the app's origin, including requests without `Origin`; SvelteKit form actions accept only form bodies. Only `/api/` is exempt, and it authenticates by Bearer key only and never reads cookies (`bearerToken` in `src/lib/server/api/router.ts`). Session cookies are also `SameSite=Lax`. |
| V3.5.2 | 1     | Pass           | Cookie-authenticated functionality does not rely on preflights (see V3.5.1). The API and MCP rely on the `Authorization` header, which is not CORS-safelisted and which a cross-site page cannot fill with the owner's key; `/files/<id>` accepts a Bearer key too, but only for GET.                                                                                                                                                                                                                       |
| V3.5.3 | 1     | Pass           | All changes go through form actions (POST) or API and MCP methods other than GET; the loads of the 18 `+page.server.ts` and layout files contain no writes, and `/logout` and `/theme` redirect on GET and act only in their POST action. The export is a GET, but it only streams a download to the owner's own browser behind a step-up, and `Lax` cookies are not sent on cross-site subresource requests.                                                                                               |
| V3.5.4 | 2     | Pass           | Manifold is a single application on its own host name; uploaded files share the origin but are served with a `sandbox` policy (V3.2.1), and map tiles come from a separate host.                                                                                                                                                                                                                                                                                                                            |
| V3.5.5 | 2     | Not applicable | The application code does not use `postMessage` or listen for `message` events (no match in `src`).                                                                                                                                                                                                                                                                                                                                                                                                         |

#### V3.7 Other Browser Security Considerations

| ID     | Level | Result | Notes                                                                                                                                                                                                                                                                                                                           |
| ------ | ----- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V3.7.1 | 2     | Pass   | Only current HTML, CSS and JavaScript (Svelte 5, OpenLayers, Tiptap); no plugins, and `object-src 'none'` forbids them.                                                                                                                                                                                                         |
| V3.7.2 | 2     | Fixed  | `safeRedirectTarget` accepted `/<tab>/evil.example`, which browsers read as another host. It now parses the target with `new URL` against a placeholder origin and falls back unless the result stays on that origin (`src/lib/utils/redirect.ts`, `redirect.test.ts`). It is used after sign-in, step-up and the theme change. |

### V4 API and Web Service

#### V4.1 Generic Web Service Security

| ID     | Level | Result   | Notes                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------ | ----- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V4.1.1 | 1     | Fixed    | SvelteKit sent pages as `text/html` without a charset. `applySecurityHeaders` now adds `charset=utf-8` to every text, JSON, JavaScript, XML and SVG response the app renders without one, and SVG icons must be valid UTF-8. Static scripts and styles from the build keep the types `sirv` gives them; module scripts are always decoded as UTF-8, and these immutable build files contain no user data.         |
| V4.1.2 | 2     | Accepted | Manifold never redirects between HTTP and HTTPS itself. The Caddy and Nginx examples in [Deployment](deployment.md) now refuse plain HTTP requests to `/api/`, `/mcp` and every request with an `Authorization` header instead of redirecting them, and `docs/api.md` and `docs/mcp.md` tell clients to use `https`. Coolify's proxy still redirects every path. See [Accepted deviations](#accepted-deviations). |
| V4.1.3 | 2     | Pass     | The client address comes from adapter-node's `ADDRESS_HEADER` and `XFF_DEPTH`, which read the entry the trusted proxy added, and Compose publishes the app only on `127.0.0.1:3000`. Protocol and host come from the fixed `ORIGIN`. Since the review, Better Auth reads the address from `x-manifold-client-address`, which `handleSession` overwrites with that trusted address on every request.               |

#### V4.2 HTTP Message Structure Validation

| ID     | Level | Result | Notes                                                                                                                                                                                                                                                                                                        |
| ------ | ----- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| V4.2.1 | 2     | Pass   | The image runs Node.js 24, whose llhttp parser is strict and refuses requests with both `Transfer-Encoding` and `Content-Length`; the app does not enable the lenient parser. HTTP/2 is terminated at the reverse proxy, and `handleBodySize` additionally answers a chunked body without a length with 411. |

#### V4.3 GraphQL

| ID     | Level | Result         | Notes       |
| ------ | ----- | -------------- | ----------- |
| V4.3.1 | 2     | Not applicable | No GraphQL. |
| V4.3.2 | 2     | Not applicable | No GraphQL. |

#### V4.4 WebSocket

| ID     | Level | Result         | Notes                                                                                                                                              |
| ------ | ----- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| V4.4.1 | 1     | Not applicable | No WebSockets in production; MCP uses stateless streamable HTTP with JSON answers (`enableJsonResponse: true`). Vite uses one only in development. |
| V4.4.2 | 2     | Not applicable | No WebSockets.                                                                                                                                     |
| V4.4.3 | 2     | Not applicable | No WebSockets.                                                                                                                                     |
| V4.4.4 | 2     | Not applicable | No WebSockets.                                                                                                                                     |

### V5 File Handling

#### V5.1 File Handling Documentation

| ID     | Level | Result | Notes                                                                                                                                                                                                                                                                                                                                                   |
| ------ | ----- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V5.1.1 | 2     | Fixed  | Uploads are documented in [Security](security.md#content-and-uploads) and [File handling](#file-handling): types, `UPLOAD_MAX_BYTES` and how files are served. Restore archives are documented in [Backups and restores](backups.md): the permitted entries, at most one million of them, and no more declared bytes than the free space of the volume. |

#### V5.2 File Upload and Content

| ID     | Level | Result | Notes                                                                                                                                                                                                                                                                                                                                                                        |
| ------ | ----- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V5.2.1 | 1     | Pass   | `checkBodySize` in src/lib/server/body-limit.ts, run in `hooks.server.ts` before the session is read, refuses multipart bodies over `UPLOAD_MAX_BYTES` plus 256 KB, other bodies over 5 MB and chunked bodies without a length; `storeUpload` checks the size again. Images are never decoded on the server, so there is no pixel bomb to process.                           |
| V5.2.2 | 1     | Fixed  | Uploads are recognized by `detectImageType` from their bytes, never from the name or the claimed type. Restores copied the archive's uploads without a check; they now check each one like a new upload and leave out, and report, files that are not accepted images (`restoreBackup` in `src/lib/server/backup/backup.ts`).                                                |
| V5.2.3 | 2     | Fixed  | `restoreBackup` counts the entries and adds up their declared sizes with `tar.list` before anything is unpacked (`checkArchiveSize` in `src/lib/server/backup/backup.ts`), and refuses more than one million entries or more bytes than the work folder has free (`fs.statfs`). It then accepts only `manifest.json`, `database.dump` and `uploads/<name>` as regular files. |

#### V5.3 File Storage

| ID     | Level | Result | Notes                                                                                                                                                                                                                                                                                                                     |
| ------ | ----- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V5.3.1 | 1     | Pass   | Uploads live in `UPLOAD_DIR` (`/data/uploads`), outside the build, and are only read as bytes by `src/routes/files/[id]/+server.ts` and the API route `GET /files/{id}`; nothing serves the folder statically.                                                                                                            |
| V5.3.2 | 1     | Pass   | Paths come from `pathFor` in `src/lib/server/files/storage.ts`, which accepts only a generated UUID storage key; the client's file name is kept only as a cleaned display name. On restore, node-tar in strict mode strips absolute paths and refuses `..`, and only regular files with the expected names are extracted. |

#### V5.4 File Download

| ID     | Level | Result   | Notes                                                                                                                                                                                                                                                                                                                                            |
| ------ | ----- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| V5.4.1 | 2     | Pass     | `cleanName` in src/lib/server/files/files.ts keeps only the base name without control characters, at most 200 characters, and `fileResponse` always sends `Content-Disposition: inline` with a file name. The export sends `attachment; filename="manifold-backup-<date>.tar.gz"` built by the server.                                           |
| V5.4.2 | 2     | Pass     | `contentDisposition` writes an ASCII fallback with quotes and backslashes replaced plus an RFC 5987 `filename*` from `encodeURIComponent`, so no quote, semicolon, CR or LF from the name reaches the header. `encodeURIComponent` leaves a few characters unencoded that RFC 8187 does not allow in `filename*`, which cannot break the header. |
| V5.4.3 | 2     | Accepted | Uploads are not scanned for viruses. Only images recognized from their bytes and checked SVG icons are accepted, and they are served only to the owner and `files:read` keys with the detected type, `nosniff` and a sandboxing policy. See [Accepted deviations](#accepted-deviations).                                                         |

### V6 Authentication

#### V6.1 Authentication Documentation

| ID     | Level | Result | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------ | ----- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V6.1.1 | 1     | Pass   | [Security](security.md#accounts-and-sign-in) documents 5 sign-in attempts per minute per client address for passwords, emailed codes, second-factor codes and resets, 3 code requests per minute, the second-factor lock after 10 wrong codes and, since the review, the limit per account on wrong answers in a signed-in session. There is deliberately no password lockout, so nobody can lock the owner out from another address. |
| V6.1.2 | 2     | Fixed  | The context-specific words (the product name, the organization name, the owner's username and email address) are now documented in [Security](security.md#accounts-and-sign-in) and in [Authentication pathways and controls](#authentication-pathways-and-controls).                                                                                                                                                                 |
| V6.1.3 | 2     | Pass   | `docs/security.md` documents every pathway together: password sign-in by username or email, emailed sign-in code, second factor after either, emailed password reset, the `owner:reset-password` and `owner:disable-2fa` commands, and Bearer API keys for REST and MCP with their scopes and step-up at creation.                                                                                                                    |

#### V6.2 Password Security

| ID      | Level | Result | Notes                                                                                                                                                                                                                                                                                                                                          |
| ------- | ----- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V6.2.1  | 1     | Pass   | `PASSWORD_MIN_LENGTH = 8` in `src/lib/schemas/rules.ts`, enforced by `newPasswordSchema`, `ownerPasswordRule` (bootstrap and CLI reset) and Better Auth's `minPasswordLength`. The recommended 15 characters is not used.                                                                                                                      |
| V6.2.2  | 1     | Pass   | The `password` action in `src/routes/(app)/settings/+page.server.ts` calls `auth.api.changePassword`.                                                                                                                                                                                                                                          |
| V6.2.3  | 1     | Pass   | `passwordChangeSchema` requires `currentPassword`, `password` and `confirmPassword`; Better Auth's `changePassword` verifies the current password, and the action also needs a step-up from the last ten minutes.                                                                                                                              |
| V6.2.4  | 1     | Fixed  | New passwords were checked for length only. They are now checked against SecLists' 10,000 most common passwords and the 43,940 entries of 12 to 128 characters of its million most common (`passwordProblem` in `src/lib/server/passwords/policy.ts`), in the password change, the emailed reset, `OWNER_PASSWORD` and `owner:reset-password`. |
| V6.2.5  | 1     | Pass   | No composition rules: `newPasswordSchema` and `ownerPasswordRule` check length only.                                                                                                                                                                                                                                                           |
| V6.2.6  | 1     | Pass   | Every password field (`login`, `forgot-password`, `settings`, `StepUpForm.svelte`, `TwoFactorPanel.svelte`) uses `type="password"`.                                                                                                                                                                                                            |
| V6.2.7  | 1     | Pass   | No paste handlers on password fields, and the fields carry `autocomplete="current-password"` or `new-password`.                                                                                                                                                                                                                                |
| V6.2.8  | 1     | Pass   | `textValue` does not trim, and the schemas do not transform passwords. Better Auth applies only NFKC normalization, both when hashing and when verifying.                                                                                                                                                                                      |
| V6.2.9  | 2     | Pass   | `PASSWORD_MAX_LENGTH = 128`, passed to Better Auth as `maxPasswordLength`.                                                                                                                                                                                                                                                                     |
| V6.2.10 | 2     | Pass   | Passwords never expire; nothing forces rotation.                                                                                                                                                                                                                                                                                               |
| V6.2.11 | 2     | Fixed  | New passwords that contain `manifold`, the organization name or one of its words, the owner's username, email address or its local part are refused; words shorter than four characters are ignored (`contextWords` in `policy.ts`, `policy.test.ts`).                                                                                         |
| V6.2.12 | 2     | Fixed  | The 43,940 breach-derived passwords of 12 to 128 characters from SecLists' million list are bundled and checked offline, without letter case, together with the 10,000 most common passwords.                                                                                                                                                  |

#### V6.3 General Authentication Security

| ID     | Level | Result   | Notes                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------ | ----- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V6.3.1 | 1     | Fixed    | Sign-in is limited per client address, as documented, and has no lockout on purpose. The Security page actions, the password change and step-up checked the password and TOTP codes without any limit, which contradicted the documentation; now 5 wrong answers per minute and account block further checks from any address (`isCredentialCheckBlocked` and `countFailedCredentialCheck` in `rate-limit.ts`). |
| V6.3.2 | 1     | Pass     | The only account is created from `OWNER_USERNAME`, `OWNER_EMAIL` and `OWNER_PASSWORD` in `owner.ts`, which are required and validated; there is no default password, and `databaseHooks.user.create.before` refuses a second user.                                                                                                                                                                              |
| V6.3.3 | 2     | Accepted | Two-factor authentication is available but optional for the single owner, who is told to turn it on. The rationale and the mitigations are in [Security](security.md#two-factor-authentication) and [Authentication pathways and controls](#authentication-pathways-and-controls). See [Accepted deviations](#accepted-deviations).                                                                             |
| V6.3.4 | 2     | Pass     | Only the documented pathways exist: Better Auth's HTTP routes are not mounted, `trustDevice` is never sent so no trusted device cookie is issued, and `email-code-two-factor.ts` applies the same second factor challenge to emailed code sign-ins that Better Auth applies to password sign-ins. API keys are scoped machine credentials created after a step-up.                                              |

#### V6.4 Authentication Factor Lifecycle and Recovery

| ID     | Level | Result         | Notes                                                                                                                                                                                                                                                                                                                                                           |
| ------ | ----- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V6.4.1 | 1     | Not applicable | Manifold never generates an initial password or activation code: the operator chooses `OWNER_PASSWORD`, and `owner:reset-password` prompts for the new password.                                                                                                                                                                                                |
| V6.4.2 | 1     | Pass           | No password hints or security questions.                                                                                                                                                                                                                                                                                                                        |
| V6.4.3 | 2     | Pass           | The reset in `forgot-password/+page.server.ts` needs a 6 digit emailed code (5 minutes, 3 tries, consumed atomically by `atomicVerifyOTP`), does not sign in, and `revokeSessionsOnPasswordReset` deletes every session; the next sign-in still asks for the TOTP or backup code. Unknown addresses get the same answer and the mail is sent in the background. |
| V6.4.4 | 2     | Pass           | Backup codes created at enrollment are the self-service recovery; without them, `owner:disable-2fa` needs shell access to the server, which is stronger proof than enrollment, and signs out every session.                                                                                                                                                     |

#### V6.5 General Multi-factor authentication requirements

| ID     | Level | Result   | Notes                                                                                                                                                                                                                                                                                                       |
| ------ | ----- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V6.5.1 | 2     | Fixed    | Backup codes and emailed codes were already single use, but Better Auth accepts a TOTP code again within its window. An accepted code is now refused for two minutes (`src/lib/server/totp-replay.ts`) at sign-in, step-up, two-factor setup, disabling and new backup codes (`totp-replay.test.ts`).       |
| V6.5.2 | 2     | Accepted | Backup codes had about 60 bits and now have 120 (24 base32 characters from `generateBackupCodes` in `src/lib/server/backup-codes.ts`), enough for a plain hash, but Better Auth still stores them encrypted under `BETTER_AUTH_SECRET` rather than hashed. See [Accepted deviations](#accepted-deviations). |
| V6.5.3 | 2     | Pass     | TOTP secrets (`generateRandomString(32)`), backup codes and emailed codes (`generateRandomString(6, "0-9")`) all come from `@better-auth/utils/random`, which uses `crypto.getRandomValues`.                                                                                                                |
| V6.5.4 | 2     | Pass     | Backup codes have 120 bits since the review, and emailed codes six random digits (about 20 bits, which the requirement names as sufficient).                                                                                                                                                                |
| V6.5.5 | 2     | Pass     | Emailed codes expire after 5 minutes (`OTP_EXPIRES_IN_SECONDS`), the second factor challenge after 10 minutes, and TOTP uses 30 second steps with one step of clock drift either side, as RFC 6238 recommends.                                                                                              |

#### V6.6 Out-of-Band authentication mechanisms

| ID     | Level | Result         | Notes                                                                                                                                                                                                                                                                                                                       |
| ------ | ----- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V6.6.1 | 2     | Not applicable | No phone or SMS factors.                                                                                                                                                                                                                                                                                                    |
| V6.6.2 | 2     | Pass           | Codes are stored per purpose and address (`sign-in-otp-<email>`, `forget-password-otp-<email>`), so a sign-in code cannot reset the password; a new request replaces the previous code, and `consumeVerificationValue` deletes every row of the identifier on use, so a code is not usable for an earlier or later request. |
| V6.6.3 | 2     | Pass           | `verifyCode` counts against the sign-in limit (5 per minute per address), code requests against their own limit (3 per minute), and each code allows 3 wrong tries before it is destroyed. Codes are stored as hashes (`storeOTP: 'hashed'`).                                                                               |

#### V6.8 Authentication with an Identity Provider

| ID     | Level | Result         | Notes                                                                                                                   |
| ------ | ----- | -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| V6.8.1 | 2     | Not applicable | No identity providers; `auth.ts` configures no social or OIDC provider.                                                 |
| V6.8.2 | 2     | Not applicable | No assertions are accepted; the app issues and accepts no JWTs (no `jwt` or `bearer` plugin, no JWT library in `src/`). |
| V6.8.3 | 2     | Not applicable | No SAML.                                                                                                                |
| V6.8.4 | 2     | Not applicable | No identity providers.                                                                                                  |

### V7 Session Management

#### V7.1 Session Management Documentation

| ID     | Level | Result         | Notes                                                                                                                                                                               |
| ------ | ----- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V7.1.1 | 2     | Fixed          | The 7-day inactivity timeout, the new 30-day absolute lifetime and the deviation from NIST SP 800-63B are documented in [Security](security.md#sessions) and [Sessions](#sessions). |
| V7.1.2 | 2     | Fixed          | Concurrent sessions are unlimited by design, visible and revocable; this is now documented in the same sections.                                                                    |
| V7.1.3 | 2     | Not applicable | No federated identity or single sign-on.                                                                                                                                            |

#### V7.2 Fundamental Session Management Security

| ID     | Level | Result | Notes                                                                                                                                                                                                                                                                                                                                                                           |
| ------ | ----- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V7.2.1 | 1     | Pass   | `handleSession` in `src/hooks.server.ts` calls `auth.api.getSession`, which looks the signed token up in the `session` table on every request; the cookie cache stays off because a database is configured.                                                                                                                                                                     |
| V7.2.2 | 1     | Pass   | Sessions are random reference tokens created by Better Auth's `createSession` at each sign-in; API keys are separate and never accepted as a session.                                                                                                                                                                                                                           |
| V7.2.3 | 1     | Pass   | Tokens are `generateId(32)` from `a-z`, `A-Z` and `0-9` via `crypto.getRandomValues`, about 190 bits.                                                                                                                                                                                                                                                                           |
| V7.2.4 | 1     | Fixed  | Sign-in, two-factor completion, the password change and turning two-factor authentication on or off create a new session. `/login` now sends a signed-in visitor back into the app (`load` in `src/routes/login/+page.server.ts`), so a second sign-in no longer leaves the old session behind. Step-up keeps the session on purpose, for the reasons in [Sessions](#sessions). |

#### V7.3 Session Timeout

| ID     | Level | Result | Notes                                                                                                                                                                                                                                                                |
| ------ | ----- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V7.3.1 | 2     | Pass   | Better Auth's default `expiresIn` of 7 days with `updateAge` of 1 day ends a session after about a week without use, as documented; sensitive actions need a step-up from the last ten minutes.                                                                      |
| V7.3.2 | 2     | Fixed  | Each day of use extended a session by another 7 days without an upper bound. `handleSession` now ends a session 30 days after its sign-in (`isPastMaximumAge` and `endSession` in `src/lib/server/sessions.ts`) and records `auth.session_expired` in the audit log. |

#### V7.4 Session Termination

| ID     | Level | Result         | Notes                                                                                                                                                                                                                                  |
| ------ | ----- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V7.4.1 | 1     | Pass           | The logout action calls `auth.api.signOut`, which deletes the session row; `revokeSession` and `revokeOtherSessions` in `sessions.ts` delete rows too, and `session_step_up` rows go with them (`onDelete: 'cascade'`).                |
| V7.4.2 | 1     | Not applicable | The single owner account cannot be disabled or deleted.                                                                                                                                                                                |
| V7.4.3 | 2     | Pass           | Password change passes `revokeOtherSessions: true`, the emailed reset and both owner commands delete every session, and **Sign Out All Other Sessions** is always offered after turning two-factor on or off or creating backup codes. |
| V7.4.4 | 2     | Pass           | `NavigationButton.svelte`, rendered by the root layout, has a **Logout** form on every page, and the command palette offers it too.                                                                                                    |
| V7.4.5 | 2     | Pass           | The owner is the only user and the administrator: **Settings → Security** ends one or all other sessions, and `owner:reset-password` or `owner:disable-2fa` end every session from the server.                                         |

#### V7.5 Defenses Against Session Abuse

| ID     | Level | Result | Notes                                                                                                                                                                                                                                                                                                                                                                    |
| ------ | ----- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| V7.5.1 | 2     | Pass   | Email and password changes need a step-up (password, plus TOTP when on); turning two-factor off and creating backup codes ask for the password and a code in the same form; turning it on asks for the password, which is full authentication while two-factor is off. The username is a sign-in identifier but not used for recovery, and changing it needs no step-up. |
| V7.5.2 | 2     | Fixed  | The sessions list ended sessions without re-authentication. `revokeSession` and `revokeOtherSessions` now require a step-up from the last ten minutes (`isSteppedUp`), and `SessionList.svelte` opens the confirmation dialog when it is missing.                                                                                                                        |

#### V7.6 Federated Re-authentication

| ID     | Level | Result         | Notes                                                                 |
| ------ | ----- | -------------- | --------------------------------------------------------------------- |
| V7.6.1 | 2     | Not applicable | No federation.                                                        |
| V7.6.2 | 2     | Not applicable | No federation; sessions are only created by an explicit sign-in form. |

### V8 Authorization

#### V8.1 Authorization Documentation

| ID     | Level | Result | Notes                                                                                                                                                                                                                                                                                                                                                                                              |
| ------ | ----- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V8.1.1 | 1     | Pass   | `docs/security.md` states that every page behind the sign-in needs the owner's session and every other request without one gets `401`, and lists the actions that need a step-up. `docs/api.md` (Scopes and the endpoint table) and `docs/mcp.md` name the scope of every REST route and MCP tool, that a write scope does not include the read scope, and which endpoints any valid key may call. |
| V8.1.2 | 2     | Fixed  | Field-level rules were scattered. They are now stated in [Security](security.md#api-keys-and-mcp) and collected in [Authorization](#authorization): `vault:read` never sees values, `map:read` sees the linked note's title, `map:write` may create the linked note, and the fields only the server sets.                                                                                          |

#### V8.2 General Authorization Design

| ID     | Level | Result | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------ | ----- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V8.2.1 | 1     | Pass   | `handleSession` in `src/hooks.server.ts` calls `guardRequest` (`src/lib/server/guard.ts`) for every route in the `(app)` group, pages, form actions and `__data.json` alike, and loads and actions also call `requireUser`. `/api/v1` (`api/router.ts`) checks the Bearer key and then `route.scope`, and `/mcp` (`mcp/server.ts`) registers only the tools whose scope the key holds; `/files/<id>` needs a session or a key with `files:read`. Better Auth's HTTP handler is not mounted, so its endpoints are reachable only through server-side `auth.api` calls; `api.int.test.ts` checks every scoped route with a key lacking the scope. |
| V8.2.2 | 1     | Pass   | There is one account and every record belongs to it, so there is no foreign object to reach; the owner's session list and revocation filter by `userId` as well (`sessions.ts`). Keys reach objects only through their module scope, the vault routes answer `viewColumns` without ciphertext, trashed notes cannot be changed and their map features are left out, and unknown ids answer 404.                                                                                                                                                                                                                                                 |
| V8.2.3 | 2     | Pass   | Form actions and API routes parse only their own fields with Zod (`secretMetadataSchema`, `emailChangeSchema`, `apiKeyCreateSchema` with scopes checked against `allScopeIds()`, route `body` schemas); version, actor, key version and hashes are set on the server. Vault values are excluded from every API and MCP answer, changing a vault value, email or password needs a step-up, and the one cross-scope field, `note_title` in map features under `map:read`, is a deliberate choice shown in `docs/api.md`.                                                                                                                          |

#### V8.3 Operation Level Authorization

| ID     | Level | Result | Notes                                                                                                                                                                                                                              |
| ------ | ----- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V8.3.1 | 1     | Pass   | All checks run on the server in hooks, load functions, form actions, the API router and the MCP server; the step-up state lives in the `session_step_up` table keyed by session id, and hidden buttons are never the only control. |

#### V8.4 Other Authorization Considerations

| ID     | Level | Result         | Notes                                                                                              |
| ------ | ----- | -------------- | -------------------------------------------------------------------------------------------------- |
| V8.4.1 | 2     | Not applicable | Single-owner, single-tenant application; sign-up is off and a database hook refuses a second user. |

### V9 Self-contained Tokens

#### V9.1 Token source and integrity

| ID     | Level | Result         | Notes                                                                                                                                |
| ------ | ----- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| V9.1.1 | 1     | Not applicable | No self-contained tokens; the signed cookies hold only random database references and their HMAC is verified before use in any case. |
| V9.1.2 | 1     | Not applicable | No self-contained tokens; cookie signatures use the fixed HMAC-SHA256 with no algorithm field to choose from.                        |
| V9.1.3 | 1     | Not applicable | No self-contained tokens; the only signing key is `BETTER_AUTH_SECRET` from the environment.                                         |

#### V9.2 Token content

| ID     | Level | Result         | Notes                                                                                                 |
| ------ | ----- | -------------- | ----------------------------------------------------------------------------------------------------- |
| V9.2.1 | 1     | Not applicable | No self-contained tokens; session and challenge expiry are read from the database rows (`expiresAt`). |
| V9.2.2 | 2     | Not applicable | No self-contained tokens.                                                                             |
| V9.2.3 | 2     | Not applicable | No self-contained tokens.                                                                             |
| V9.2.4 | 2     | Not applicable | No self-contained tokens and no token issuer.                                                         |

### V10 OAuth and OIDC

#### V10.1 Generic OAuth and OIDC Security

| ID      | Level | Result         | Notes                                                                                 |
| ------- | ----- | -------------- | ------------------------------------------------------------------------------------- |
| V10.1.1 | 2     | Not applicable | No OAuth or OIDC tokens exist.                                                        |
| V10.1.2 | 2     | Not applicable | No authorization flows are started, so there is no `state`, PKCE verifier or `nonce`. |

#### V10.2 OAuth Client

| ID      | Level | Result         | Notes                |
| ------- | ----- | -------------- | -------------------- |
| V10.2.1 | 2     | Not applicable | Not an OAuth client. |
| V10.2.2 | 2     | Not applicable | Not an OAuth client. |

#### V10.3 OAuth Resource Server

| ID      | Level | Result         | Notes                                                                                                                   |
| ------- | ----- | -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| V10.3.1 | 2     | Not applicable | Accepts only its own API keys, never OAuth access tokens.                                                               |
| V10.3.2 | 2     | Not applicable | Accepts no access tokens; key scopes are Manifold's own and are enforced by the router and the MCP server (see V8.2.1). |
| V10.3.3 | 2     | Not applicable | Accepts no access tokens.                                                                                               |
| V10.3.4 | 2     | Not applicable | Accepts no access tokens.                                                                                               |

#### V10.4 OAuth Authorization Server

| ID       | Level | Result         | Notes                                                                                                          |
| -------- | ----- | -------------- | -------------------------------------------------------------------------------------------------------------- |
| V10.4.1  | 1     | Not applicable | Not an authorization server.                                                                                   |
| V10.4.2  | 1     | Not applicable | Not an authorization server.                                                                                   |
| V10.4.3  | 1     | Not applicable | Not an authorization server.                                                                                   |
| V10.4.4  | 1     | Not applicable | Not an authorization server.                                                                                   |
| V10.4.5  | 1     | Not applicable | Not an authorization server; there are no refresh tokens.                                                      |
| V10.4.6  | 2     | Not applicable | Not an authorization server.                                                                                   |
| V10.4.7  | 2     | Not applicable | No dynamic client registration.                                                                                |
| V10.4.8  | 2     | Not applicable | No refresh tokens.                                                                                             |
| V10.4.9  | 2     | Not applicable | No refresh or reference access tokens; API keys, the nearest equivalent, are revoked under Settings, API Keys. |
| V10.4.10 | 2     | Not applicable | No OAuth clients.                                                                                              |
| V10.4.11 | 2     | Not applicable | No OAuth clients.                                                                                              |

#### V10.5 OIDC Client

| ID      | Level | Result         | Notes                                                 |
| ------- | ----- | -------------- | ----------------------------------------------------- |
| V10.5.1 | 2     | Not applicable | Not a relying party; no ID Tokens.                    |
| V10.5.2 | 2     | Not applicable | Not a relying party.                                  |
| V10.5.3 | 2     | Not applicable | Not a relying party; no provider metadata is fetched. |
| V10.5.4 | 2     | Not applicable | Not a relying party.                                  |
| V10.5.5 | 2     | Not applicable | No back-channel logout.                               |

#### V10.6 OpenID Provider

| ID      | Level | Result         | Notes                   |
| ------- | ----- | -------------- | ----------------------- |
| V10.6.1 | 2     | Not applicable | Not an OpenID Provider. |
| V10.6.2 | 2     | Not applicable | Not an OpenID Provider. |

#### V10.7 Consent Management

| ID      | Level | Result         | Notes                                                                                                      |
| ------- | ----- | -------------- | ---------------------------------------------------------------------------------------------------------- |
| V10.7.1 | 2     | Not applicable | No authorization server, so no consent requests.                                                           |
| V10.7.2 | 2     | Not applicable | No authorization server.                                                                                   |
| V10.7.3 | 2     | Not applicable | No authorization server; the owner reviews and revokes API keys and their scopes under Settings, API Keys. |

### V11 Cryptography

#### V11.1 Cryptographic Inventory and Documentation

| ID      | Level | Result | Notes                                                                                                                                                                                                                                                                                             |
| ------- | ----- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V11.1.1 | 2     | Fixed  | The lifecycle of `BETTER_AUTH_SECRET` and `ENCRYPTION_KEY` (generation, storage, use, rotation, destruction) is now documented in [Security](security.md#cryptography-and-keys) and [Cryptography](#cryptography); each key has one purpose and is held only by the app process and the operator. |
| V11.1.2 | 2     | Fixed  | The inventory of algorithms, parameters and keys is now in [Security](security.md#cryptography-and-keys) and, with the stored formats, in [Cryptography](#cryptography).                                                                                                                          |

#### V11.2 Secure Cryptography Implementation

| ID      | Level | Result   | Notes                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------- | ----- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V11.2.1 | 2     | Pass     | Only Node.js `crypto` (OpenSSL), Web Crypto and the audited `@noble/ciphers` and `@noble/hashes` used by Better Auth; no hand-written primitives.                                                                                                                                                                                                                                                                                 |
| V11.2.2 | 2     | Accepted | Password hashes now name their algorithm and parameters (`$scrypt$ln=15,r=8,p=3$...`) and older hashes are upgraded at the next sign-in; the vault key rotates with `vault:rotate-key` and API keys are revoked and reissued. Rotating `BETTER_AUTH_SECRET` still means turning two-factor authentication off and on again, a documented procedure instead of versioned secrets. See [Accepted deviations](#accepted-deviations). |
| V11.2.3 | 2     | Pass     | AES-256-GCM, XChaCha20-Poly1305 with a 256-bit key, HMAC-SHA256, SHA-256 and scrypt; `ENCRYPTION_KEY` is exactly 32 bytes and `BETTER_AUTH_SECRET` at least 32 characters (`env.ts`), documented as `openssl rand -base64 32`.                                                                                                                                                                                                    |

#### V11.3 Encryption Algorithms

| ID      | Level | Result | Notes                                                                                                                                                                                                                |
| ------- | ----- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V11.3.1 | 1     | Pass   | No ECB, no CBC and no RSA padding anywhere; only AES-GCM and XChaCha20-Poly1305.                                                                                                                                     |
| V11.3.2 | 1     | Pass   | `aes-256-gcm` in `crypto.server.ts`; Better Auth uses XChaCha20-Poly1305, an approved AEAD in ASVS's cryptography appendix.                                                                                          |
| V11.3.3 | 2     | Fixed  | `unseal` accepted whatever tag length was stored. The vault's cipher and decipher now pin `authTagLength` to 16 bytes (`AUTH_TAG_BYTES` in `src/lib/modules/vault/crypto.server.ts`), so a shortened tag is refused. |

#### V11.4 Hashing and Hash-based Functions

| ID      | Level | Result         | Notes                                                                                                                                                                                                                                                                                                                                             |
| ------- | ----- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V11.4.1 | 1     | Pass           | SHA-256 and HMAC-SHA256 throughout; no MD5 or plain SHA-1. SHA-1 appears only inside HMAC for TOTP as RFC 6238 and authenticator apps require, which remains an approved HMAC use.                                                                                                                                                                |
| V11.4.2 | 2     | Fixed          | Better Auth's default scrypt (N = 2^14, r = 16, p = 1) was below OWASP's guidance. Passwords are now hashed at N = 2^15, r = 8, p = 3 by `src/lib/server/passwords/hash.ts`, configured as Better Auth's `hash` and `verify`; older hashes still verify and are replaced at the next password sign-in (`upgradeOwnerPasswordHash` in `owner.ts`). |
| V11.4.3 | 2     | Pass           | Integrity and authentication uses SHA-256 (256-bit output) and HMAC-SHA256: migration checksums, upload digests, API key hashes and cookie signatures.                                                                                                                                                                                            |
| V11.4.4 | 2     | Not applicable | No key is derived from a password. `ENCRYPTION_KEY` is used as 32 raw bytes; Better Auth hashes `BETTER_AUTH_SECRET`, a random configuration secret rather than a password, with SHA-256 to get its XChaCha20 key. There is no password-protected export.                                                                                         |

#### V11.5 Random Values

| ID      | Level | Result | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------- | ----- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V11.5.1 | 2     | Pass   | API key secrets have 256 bits (`randomBytes(32)`), session tokens about 190 bits (`generateId(32)`, 62 symbols, `getRandomValues`), TOTP secrets 192 bits. The two-factor challenge identifier has 120 bits (`generateRandomString(20)`, also in `email-code-two-factor.ts`) but is only accepted inside an HMAC-SHA256 signed cookie. UUIDs (vault ids, file storage names, note draft keys) are not secrets: files and records are served only after a session or scope check. |

#### V11.6 Public Key Cryptography

| ID      | Level | Result         | Notes                                                                                                                                                              |
| ------- | ----- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| V11.6.1 | 2     | Not applicable | The application generates no key pairs and makes or checks no signatures; TLS is terminated by the reverse proxy and outgoing SMTP uses Node's TLS defaults (V12). |

### V12 Secure Communication

#### V12.1 General TLS Security Guidance

| ID      | Level | Result         | Notes                                                                                                                                                                                                                                                                                                              |
| ------- | ----- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| V12.1.1 | 1     | Pass           | TLS is terminated by the reverse proxy. `docs/deployment.md` ("Before you go live" item 4, "TLS and plain HTTP") requires TLS 1.2 and 1.3 only, the Nginx example sets `ssl_protocols TLSv1.2 TLSv1.3`, and Caddy and Coolify use these versions by default. Node's own TLS clients default to TLS 1.2 as minimum. |
| V12.1.2 | 2     | Fixed          | The Nginx example in `docs/deployment.md` had no `ssl_ciphers` and fell back to Nginx's broad default. It now allows only ECDHE suites with AES-GCM or ChaCha20-Poly1305; Caddy and Coolify use modern suites by default.                                                                                          |
| V12.1.3 | 2     | Not applicable | No mutual TLS; clients authenticate with sessions or Bearer keys.                                                                                                                                                                                                                                                  |

#### V12.2 HTTPS Communication with External Facing Services

| ID      | Level | Result | Notes                                                                                                                                                                                                                                                                               |
| ------- | ----- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V12.2.1 | 1     | Pass   | Browsers reach the app only through the TLS proxy (`docker-compose.yml` publishes port 3000 on `127.0.0.1` only). Page requests on plain HTTP are redirected, requests with keys are refused in the Caddy and Nginx examples, and HSTS on every response prevents a later fallback. |
| V12.2.2 | 1     | Pass   | `docs/deployment.md` requires a publicly trusted certificate; the Caddy, Coolify and Let's Encrypt based Nginx examples obtain one. The app cannot check this itself.                                                                                                               |

#### V12.3 General Service to Service Communication Security

| ID      | Level | Result         | Notes                                                                                                                                                                                                                                                                                                                                                                     |
| ------- | ----- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V12.3.1 | 2     | Fixed          | SMTP requires TLS 1.2 or newer (`requireTLS` and `minVersion` in `src/lib/server/services/mail/transport.ts`), except for a relay on the same machine. The bundled database is reached over Compose's network on the same host, and [Configuration](configuration.md#database) requires `sslmode=verify-full` for a database reached over a network one does not control. |
| V12.3.2 | 2     | Fixed          | Nodemailer validates certificates (`rejectUnauthorized: true`). For an external PostgreSQL, [Configuration](configuration.md#database) requires `sslmode=verify-full`, with which `postgres.js` verifies the certificate and the host name.                                                                                                                               |
| V12.3.3 | 2     | Pass           | The only internal HTTP hops are proxy to app and the container health check (`docker/healthcheck.mjs`), both on the same host (`127.0.0.1` or the host-local Docker network that `docs/deployment.md` describes); the app is not split into HTTP services.                                                                                                                |
| V12.3.4 | 2     | Not applicable | There are no TLS connections between internal services; the database hop is covered under V12.3.1.                                                                                                                                                                                                                                                                        |

### V13 Configuration

#### V13.1 Configuration Documentation

| ID      | Level | Result | Notes                                                                                                                                                                                                                                                                                                                                                                                          |
| ------- | ----- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V13.1.1 | 2     | Fixed  | There was no single list of connections. [Security](security.md#connections) and [Communication](#communication) now list the database, SMTP, map tiles loaded by the browser and the Coolify webhook called by GitHub Actions, and state that the server never fetches service addresses; Better Auth telemetry is off in code (`telemetry: { enabled: false }` in `src/lib/server/auth.ts`). |

#### V13.2 Backend Communication Configuration

| ID      | Level | Result   | Notes                                                                                                                                                                                                                                                                                                                                                    |
| ------- | ----- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V13.2.1 | 2     | Accepted | The app authenticates to PostgreSQL with a random password in `DATABASE_URL`, on Compose's network without a published port. See [Accepted deviations](#accepted-deviations).                                                                                                                                                                            |
| V13.2.2 | 2     | Accepted | The app container runs unprivileged, but the app connects as `POSTGRES_USER`, which the `postgis/postgis` image creates as a superuser and which the migrations use to create extensions. See [Accepted deviations](#accepted-deviations).                                                                                                               |
| V13.2.3 | 2     | Fixed    | The app's own secrets have no defaults. `.env.example` ships the database password `change-me`, which `parseEnv` in `src/lib/server/env.ts` now refuses when `ORIGIN` is `https`.                                                                                                                                                                        |
| V13.2.4 | 2     | Pass     | The server connects only to `DATABASE_URL` and `SMTP_HOST` from the environment and reads files only under `UPLOAD_DIR` and `/data`; there is no code that fetches a user-supplied address (service addresses are links only, uploads are stored bytes). The browser side is limited by the page CSP (`connect-src 'self'`, scripts and fonts `'self'`). |
| V13.2.5 | 2     | Pass     | Same evidence as V13.2.4: the set of systems the server talks to is fixed by configuration, and no module, the MCP server or the API can make it send a request elsewhere.                                                                                                                                                                               |

#### V13.3 Secret Management

| ID      | Level | Result | Notes                                                                                                                                                                                                                                                                                                                       |
| ------- | ----- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V13.3.1 | 2     | Fixed  | Secrets are not in the code or the image. `DATABASE_URL`, `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY`, `OWNER_PASSWORD` and `SMTP_PASSWORD` can now come from files named by `*_FILE` variables, such as Docker secrets (`resolveFileVariables` in `src/lib/server/env.ts`); setting both forms is refused.                      |
| V13.3.2 | 2     | Pass   | Each container gets only what it needs: the database container the `POSTGRES_*` values, the app `DATABASE_URL`, `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY` and the SMTP password. The app container has a single unprivileged user, and `docs/security.md` tells the operator to remove `OWNER_PASSWORD` after the first start. |

#### V13.4 Unintended Information Leakage

| ID      | Level | Result | Notes                                                                                                                                                                                                                                                                                                    |
| ------- | ----- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V13.4.1 | 1     | Pass   | `.dockerignore` excludes `.git`, `.github`, `.claude`, `agents` and `docs`; the runtime stage copies only `build`, `build-cli/cli.js`, `node_modules`, `migrations`, `package.json`, the SBOM and the health check.                                                                                      |
| V13.4.2 | 2     | Pass   | The image sets `NODE_ENV=production` and runs the production build; the development mail preview answers 404 unless the build-time `dev` flag is set, `handleError` returns only a generic message and an error id, the API router answers `internal_error`, and `build/client` contains no source maps. |
| V13.4.3 | 2     | Pass   | `sirv` in adapter-node serves only existing files and has no directory listing; uploads are reachable only by id at `/files/<id>` behind a session or key.                                                                                                                                               |
| V13.4.4 | 2     | Pass   | `src/server.ts` refuses `TRACE`, `TRACK` and `CONNECT` with 405 before any handler runs; the API router answers unknown methods with 405, `/mcp` exports only its methods, and SvelteKit answers other methods on pages with 405.                                                                        |
| V13.4.5 | 2     | Pass   | The OpenAPI document at `/api/v1/openapi.json` needs a valid key (`scope: null` still passes through the key check in `router.ts`), `/healthz` only says `ok` or `unavailable` and is documented as intended, and there are no other documentation or monitoring endpoints.                              |

### V14 Data Protection

#### V14.1 Data Protection Documentation

| ID      | Level | Result | Notes                                                                                                                                             |
| ------- | ----- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| V14.1.1 | 2     | Fixed  | Data is now classified as secret, private and operational in [Security](security.md#data) and [Data protection](#data-protection).                |
| V14.1.2 | 2     | Fixed  | The same sections set the protection for each class: encryption or hashing at rest, what may be logged, who may access it, retention and backups. |

#### V14.2 General Data Protection

| ID      | Level | Result | Notes                                                                                                                                                                                                                                                                                                                                                   |
| ------- | ----- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V14.2.1 | 1     | Pass   | API keys are read only from the `Authorization` header (`bearerToken` in src/lib/server/api/router.ts, `keyAllows` in the files route), session tokens only from cookies, and passwords, sign-in codes and reset codes are form fields in POST bodies. No flow puts a token in a link; password resets use a typed code, not an emailed URL.            |
| V14.2.2 | 2     | Fixed  | Pages, `__data.json` and form action responses carried no `Cache-Control`. `applySecurityHeaders` now sends `no-store` on every response without its own policy; API answers were already `no-store`, and files keep `private, max-age=31536000, immutable` for owner-only content under random ids.                                                    |
| V14.2.3 | 2     | Pass   | No analytics or third-party scripts; the CSP in vite.config.ts limits scripts, styles, fonts and connections to the app, and fonts are self-hosted through `@fontsource`. The only third party is the map tile server (`MAP_TILE_URL`, OpenStreetMap by default), which receives tile requests from the browser as documented in docs/configuration.md. |
| V14.2.4 | 2     | Fixed  | With the classification in place, the controls of each class were checked against it: vault values encrypted, API keys, emailed codes and passwords hashed, the TOTP secret and backup codes encrypted, no secrets in audit entries or logs, retention for the trash and the audit log.                                                                 |

#### V14.3 Client-side Data Protection

| ID      | Level | Result | Notes                                                                                                                                                                                                                                                    |
| ------- | ----- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V14.3.1 | 1     | Fixed  | Signing out now answers with `Clear-Site-Data: "cache", "storage"` (`handleSecurityHeaders` for `POST /logout` in every locale, covered by `auth.test.ts`), which removes cached pages and the map view in `localStorage`; pages are `no-store` as well. |
| V14.3.2 | 2     | Fixed  | Authenticated pages and their data loads are now `no-store` (see V14.2.2), so the browser's HTTP cache does not keep note, vault or audit pages.                                                                                                         |
| V14.3.3 | 2     | Fixed  | Cookies hold the session, the second-factor challenge and UI preferences, and revealed vault values stay in memory. `localStorage` holds only the last map view (centre and zoom), which `Clear-Site-Data` now removes at sign-out.                      |

### V15 Secure Coding and Architecture

#### V15.1 Secure Coding and Architecture Documentation

| ID      | Level | Result | Notes                                                                                                                                                                                                                                                                                        |
| ------- | ----- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V15.1.1 | 1     | Pass   | SECURITY.md (Dependencies) sets remediation time frames per severity (7, 30 and 90 days) and says how unreachable vulnerabilities are handled; general updates come from Dependabot every week (.github/dependabot.yml for npm, GitHub Actions and the base image).                          |
| V15.1.2 | 2     | Fixed  | Every package was a `devDependency`, so `npm sbom --omit dev` left the SBOM without third-party components. The runtime packages are now `dependencies` in `package.json` and appear in `/app/sbom.cdx.json`; all come from registry.npmjs.org with integrity hashes in `package-lock.json`. |
| V15.1.3 | 2     | Fixed  | The resource-intensive functions, their limits and why no response outlasts a client's timeout are now documented in [Resource-intensive functions](#resource-intensive-functions) and the limits in [Security](security.md#limits).                                                         |

#### V15.2 Security Architecture and Dependencies

| ID      | Level | Result | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------- | ----- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| V15.2.1 | 1     | Pass   | CI runs `npm audit` at the level `high` on every build through `scripts/audit.ts`, which accepts only advisories without a fixed release that reach the project through build tools alone (`.github/workflows/ci.yml`), the `cookie` and `esbuild` overrides in `package.json` clear the known advisories, and Dependabot proposes updates weekly for npm, GitHub Actions and the base image, within the time frames of SECURITY.md. |
| V15.2.2 | 2     | Fixed  | Key requests to `/files/<id>` were not counted and exports could run in parallel. The files route now counts them with `consumeApiRequest`, and only one export runs at a time (`exportRunning`, 429 otherwise), next to the existing body, page, search and rate limits.                                                                                                                                                            |
| V15.2.3 | 2     | Pass   | The runtime image copies only `build`, `cli.js`, the production `node_modules`, `migrations`, `package.json`, the SBOM and the health check (Dockerfile); tests are not built. The only development route, `src/routes/dev/mail/[template]/+server.ts`, answers 404 unless `dev` is true, which is false in the production build, and printing mails to the console is `dev` only as well.                                           |

#### V15.3 Defensive Coding

| ID      | Level | Result         | Notes                                                                                                                                                                                                                                                                                                                                     |
| ------- | ----- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V15.3.1 | 1     | Pass           | Responses are built from explicit views: `toFileResource`, `findNote`, `toSummary`, `toSessionUser` in the root layout, vault lists without values, API keys without their hash. `storageKey`, `sha256`, `keyHash` and vault ciphertext never leave the server.                                                                           |
| V15.3.2 | 2     | Not applicable | The backend makes no HTTP requests to external URLs: there are no webhooks or link previews, map tiles are loaded by the browser, and the only outgoing connection is SMTP through nodemailer.                                                                                                                                            |
| V15.3.3 | 2     | Pass           | Each action and API route parses its input with a Zod object schema, which drops unknown keys, before `...data` reaches Drizzle (`parseInput` in services.server.ts, `parse(secretCreateSchema, ...)` in vault.server.ts); server-controlled fields such as `iconFileId`, `position` and `updatedAt` are set explicitly.                  |
| V15.3.4 | 2     | Fixed          | Better Auth recorded session addresses from the raw `X-Forwarded-For`. It now reads `x-manifold-client-address` (`advanced.ipAddress.ipAddressHeaders` in `auth.ts`), which `handleSession` sets to `event.getClientAddress()`, so every part of the app follows `ADDRESS_HEADER` and `XFF_DEPTH` and a client cannot choose its address. |
| V15.3.5 | 2     | Pass           | TypeScript runs with `strict: true`, input is typed by Zod before use, and no loose `==` or `!=` comparisons exist in src. There is no ESLint `eqeqeq` rule to keep it that way.                                                                                                                                                          |
| V15.3.6 | 2     | Pass           | Rate limit windows use a `Map`; query and path parameters go through `Object.fromEntries`, which defines own properties, and then Zod, which builds new objects; cookie and `localStorage` JSON is read field by field (`parseSidebarPreferences`, `isViewState`). No code merges untrusted objects into others.                          |
| V15.3.7 | 2     | Pass           | Form fields are read with `FormData.get` (first value) through `textValue`, API query parameters from the query string only and bodies from JSON only, each validated by its own schema; SvelteKit does not mix sources.                                                                                                                  |

### V16 Security Logging and Error Handling

#### V16.1 Security Logging Documentation

| ID      | Level | Result | Notes                                                                                                                                                                                                                                                                                                    |
| ------- | ----- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V16.1.1 | 2     | Pass   | [Security](security.md#logging) documents the application log (format, levels, events and what is never logged) and the audit log (events, fields, access and `AUDIT_RETENTION_DAYS`), and [Operations](operations.md) covers reading and keeping the logs; the review updated both for the fixes below. |

#### V16.2 General Logging

| ID      | Level | Result | Notes                                                                                                                                                                                                                                                                                                                                              |
| ------- | ----- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V16.2.1 | 2     | Fixed  | Log lines were bare `console` messages. `log` in `src/lib/server/log.ts` now writes the time and level with every line, security events add the address, path or key id, and `handleError` logs unexpected errors with an id, the method and the route and returns the id. Audit entries hold time, actor, action, target, address and user agent. |
| V16.2.2 | 2     | Pass   | Audit times are `timestamptz` written from the server clock and shown in UTC (docs/decisions.md); the container uses the host clock, and Docker's `-t` timestamps are UTC.                                                                                                                                                                         |
| V16.2.3 | 2     | Pass   | Logs go only to the container's standard output and standard error and to the `audit_event` table, both documented in [Security](security.md#logging); nodemailer and Better Auth write to the same console.                                                                                                                                       |
| V16.2.4 | 2     | Fixed  | The application log is now one JSON object per line, with the stack trace as a field, so a log processor can read it without parsing text.                                                                                                                                                                                                         |
| V16.2.5 | 2     | Pass   | Audit metadata never holds secrets (comment in src/lib/server/audit.ts; failed sign-ins store only the method), mails are logged without content, env errors name the variable only, and `pg-tools` errors omit the connection string. There is no redaction layer, so this rests on each call site.                                               |

#### V16.3 Security Events

| ID      | Level | Result | Notes                                                                                                                                                                                                                                                                                                                                                                                |
| ------- | ----- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| V16.3.1 | 2     | Fixed  | Sign-ins and failures are audited with the method (password, emailed code, TOTP, backup code), as are sign-outs, step-ups and failed step-ups, and wrong password reset codes as `auth.password_reset_failed` (`reset` action in `src/routes/forgot-password/+page.server.ts`); missing or invalid API keys are logged as security events. Every audit event is mirrored to the log. |
| V16.3.2 | 2     | Fixed  | Refused scopes were not logged. The API router and the files route now log `insufficient_scope`; the MCP server registers only the tools a key's scopes allow and answers a call to any other tool like an unknown tool. Requests without a session to protected routes are redirected or answered with 401, and failed step-ups are audited.                                        |
| V16.3.3 | 2     | Fixed  | Rate limits, blocked credential checks, cross-site form posts, oversized or chunked bodies and rejected uploads are now logged at `warn` as security events (`logSecurityEvent`, called from `rate-limit.ts`, `hooks.server.ts` and `files.ts`).                                                                                                                                     |
| V16.3.4 | 2     | Pass   | `handleError` in `src/hooks.server.ts` logs unexpected errors with an id, and the API router, the MCP server, housekeeping, the export and mail delivery, including SMTP and TLS failures, log theirs.                                                                                                                                                                               |

#### V16.4 Log Protection

| ID      | Level | Result | Notes                                                                                                                                                                                                                                                                                           |
| ------- | ----- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V16.4.1 | 2     | Pass   | Log lines are built with `JSON.stringify`, which escapes line breaks and control characters, and audit entries are stored as columns and JSONB and rendered by Svelte, which escapes them.                                                                                                      |
| V16.4.2 | 2     | Fixed  | The audit table could be changed. Migration `0012_core_audit_append_only.sql` now adds triggers that refuse every `UPDATE` and refuse `DELETE` and `TRUNCATE` unless the transaction set `manifold.audit_purge`, which only `purgeAuditEvents` does for the retention (`security.int.test.ts`). |
| V16.4.3 | 2     | Fixed  | Audit events stayed in the database. `recordAudit` now also writes each one to standard output (`Audit event` at `info`), so it can be kept by a log system outside the server, as [Security](security.md#audit-log) recommends.                                                                |

#### V16.5 Error Handling

| ID      | Level | Result | Notes                                                                                                                                                                                                                                                                                                                                                      |
| ------- | ----- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V16.5.1 | 2     | Pass   | Unexpected errors show a generic message and an error id (`handleError` returns only SvelteKit's message and the id), the API and MCP answer `internal_error`, and environment errors name the variable, never the value.                                                                                                                                  |
| V16.5.2 | 2     | Pass   | Mail is sent in the background and a failure never blocks sign-in or a notice (`sendMailInBackground`); features that need mail are hidden without SMTP; `/healthz` reports 503 while the database is down; a failing housekeeping task does not stop the others.                                                                                          |
| V16.5.3 | 2     | Pass   | `guardRequest` denies protected routes without a session, the API router checks key, rate limit and scope before the handler, validation failures return before any write, and `storeUpload` removes the stored bytes when the row cannot be written. Only audit writes fail open, deliberately and documented, so an audit outage cannot block the owner. |

### V17 WebRTC

#### V17.1 TURN Server

| ID      | Level | Result         | Notes            |
| ------- | ----- | -------------- | ---------------- |
| V17.1.1 | 2     | Not applicable | No TURN service. |

#### V17.2 Media

| ID      | Level | Result         | Notes                                 |
| ------- | ----- | -------------- | ------------------------------------- |
| V17.2.1 | 2     | Not applicable | No DTLS certificate; no media server. |
| V17.2.2 | 2     | Not applicable | No media server.                      |
| V17.2.3 | 2     | Not applicable | No SRTP.                              |
| V17.2.4 | 2     | Not applicable | No SRTP.                              |

#### V17.3 Signaling

| ID      | Level | Result         | Notes                |
| ------- | ----- | -------------- | -------------------- |
| V17.3.1 | 2     | Not applicable | No signaling server. |
| V17.3.2 | 2     | Not applicable | No signaling server. |
