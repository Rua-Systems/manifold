# Security

Manifold keeps your notes, your places and the passwords in your vault, so it is built to run on the public internet behind a single owner account. This page summarizes how it protects the account and the data. The complete review against OWASP ASVS 5.0 levels 1 and 2 is in the [security review](SECURITY-REVIEW.md). To report a vulnerability, follow [SECURITY.md](../SECURITY.md) instead of opening a public issue.

## Accounts and sign-in

- There is exactly one account, the owner. Manifold creates it from `OWNER_USERNAME`, `OWNER_EMAIL` and `OWNER_PASSWORD` on the first start, when no user exists, and ignores these variables afterwards. There is no sign-up: it is turned off, and a check before every account creation refuses a second user.
- You sign in with your username or email address and your password or, when email is set up, with a six-digit code that is sent to your address and is valid for five minutes. Emailed codes are stored only as hashes. See [Your account](account.md) and [Email](email.md).
- Passwords have 8 to 128 characters. A new password is refused when it is among the most common passwords (the 10,000 most common ones, and the entries of 12 characters and more among the million most common, from SecLists) or contains the product name, the organization name, the username or the email address. This applies to the first owner password, to password changes and resets, and to `owner:reset-password`.
- Passwords are hashed with scrypt at N = 2^15, r = 8 and p = 3, in a format that names these parameters. Hashes from earlier versions of Manifold keep working and are replaced at the next sign-in with the password.
- Sign-in attempts are limited to 5 per minute per client address. The limit covers passwords, emailed codes, second-factor codes and password resets. Requests for emailed codes are limited to 3 per minute. These limits need the real client address, so set up the reverse proxy as described in [Deployment](deployment.md).
- A wrong username and a wrong password get the same answer. Emailed codes are sent in the background, so the response time does not tell whether an address belongs to the owner.
- Failed sign-ins are recorded in the audit log with the method, the address and the device, but without the name that was typed, since a mistyped password can end up in that field.
- When email is set up, Manifold mails you when someone signs in from a browser it has not seen before, and when your password changes. It remembers browsers only as a SHA-256 hash of their user agent.
- Resetting a forgotten password needs an emailed code and signs out every session. Without email, you reset the password on the server with `node cli.js owner:reset-password`, see [Operations](operations.md).

## Two-factor authentication

- Two-factor authentication uses authenticator apps (TOTP). You turn it on under **Settings → Security**: choose **Set Up**, enter your password, scan the QR code, enter the first code and choose **Turn On**.
- Turning it on gives you 10 backup codes of 24 random characters (120 bits) each, every one of which signs you in once when the authenticator app is not at hand. They are shown only once. **Create New Codes** replaces all of them.
- Once it is on, every sign-in asks for a code after the password or the emailed code. The second step must be finished within ten minutes and allows five wrong codes before you have to start over. After 10 wrong codes in a row, the second step is locked for 15 minutes.
- A code from the authenticator app is accepted only once: the same code is refused for two minutes afterwards, at sign-in and everywhere else a code is asked for.
- Turning two-factor authentication off and creating new backup codes ask for your password and a current code in the same form.
- The authenticator secret and the backup codes are stored encrypted under `BETTER_AUTH_SECRET`.
- If you lose both the authenticator app and the backup codes, `node cli.js owner:disable-2fa` on the server turns two-factor authentication off and signs out every session.

Two-factor authentication is optional, because Manifold has one account, set up by the person who runs the server, and there is nobody to enforce it on. Turn it on: without it, a stolen password is enough to sign in. The sign-in limits, the identity confirmations below and the notices about new browsers reduce the risk until you do.

## Confirming your identity

Some actions need a fresh proof that it is you at the keyboard. The **Confirm Your Identity** dialog asks for your password, and for a code from your authenticator app when two-factor authentication is on, before you can:

- Change your email address or your password.
- Create an API key.
- Reveal, copy or change a vault value.
- Download the data export.
- End one of your sessions or all other sessions.

A confirmation lasts ten minutes and belongs to the current session, so another browser or a new sign-in has to confirm again. Confirmations and failed attempts are recorded in the audit log, and attempts are limited to 5 per minute per client address.

Every form of a signed-in session that checks your password or a code, the confirmation, the password change and the two-factor settings, counts the wrong answers for the account: after 5 within a minute, these forms refuse further attempts until the minute is over, whatever address they come from. A stolen session cookie therefore cannot be used to guess the password or a code.

## Sessions

- Session cookies are `HttpOnly` and `SameSite=Lax`, with the path `/` and no domain. When `ORIGIN` starts with `https://`, they are also `Secure` and carry the `__Secure-` prefix.
- A session ends after seven days without use and is extended while you use it, but it ends 30 days after its sign-in at the latest. Then you sign in again.
- You may be signed in on any number of browsers at once. **Settings → Security** lists your sessions with their device, address, sign-in time and last activity. **Sign Out** ends one of them, and **Sign Out All Other Sessions** ends every session but the current one, after a confirmation of your identity. The list works with session ids, never with the tokens that sign you in.
- The address a session shows is the client address the app trusts, which honors `ADDRESS_HEADER` and `XFF_DEPTH`, never a header the client chose.
- Changing your password signs out your other sessions. Resetting it by email, and the commands `owner:reset-password` and `owner:disable-2fa`, sign out every session.
- Signing out asks the browser to delete cached pages and stored data (`Clear-Site-Data`), such as the last map view. The sign-in page sends a signed-in visitor back into the app instead of starting a second session.

## API keys and MCP

- A key consists of a lookup prefix and 32 random bytes. Manifold stores only a SHA-256 hash of it and compares hashes in constant time. The key is shown once, when it is created, and creating one needs a confirmation of your identity.
- Every key carries scopes per module, and a write scope does not include the read scope. `vault:read` sees only names, addresses and descriptions: no API route and no MCP tool returns or accepts a vault value. `map:write` may create the note a new map feature is linked to, and `map:read` sees the title of the linked note.
- A key can expire on a date you choose, and revoking it takes effect at once. Unknown, revoked and expired keys get the same answer.
- The REST API and the MCP server accept keys only in the `Authorization` header and never read cookies, so a signed-in browser cannot be turned against them. Give clients `https` addresses: a key sent over plain HTTP crosses the network in clear text. The reverse proxy examples in [Deployment](deployment.md) refuse such requests instead of redirecting them.
- Each key may make `API_RATE_LIMIT_PER_MINUTE` requests per minute, 120 unless changed, across REST, MCP and file downloads with the key together.
- Every write through a key is recorded in the audit log, and the key list shows when and from which address each key was last used.

See [REST API](api.md) and [MCP server](mcp.md) for the details.

## Shared notes

- A note token is built and stored like an API key, starts with `mfn_`, and is created only after a confirmation of your identity. It reaches one note, for reading or for reading and editing, and always expires on a day you choose.
- The share link carries the token after `#`, which browsers never send to a server, so it does not reach the server's or a proxy's logs. The page takes it out of the address, posts it once, and keeps it in an `HttpOnly`, `SameSite=Strict` cookie, `Secure` over `https`, until the token's last day.
- The shared page shows nothing of the account: no sidebar, no other note, no history, no uploads. As a Bearer key, a note token reaches only the routes and tools marked for it, on its own note; another note answers as if it did not exist.
- Opening a link is limited to 10 attempts per minute and address, and the token's requests count against `API_RATE_LIMIT_PER_MINUTE`. Revoking or deleting a token, or moving its note to the trash, stops it at once.

## The vault

- Vault values are encrypted with AES-256-GCM under `ENCRYPTION_KEY`, 32 random bytes that the app checks on start. Every value gets its own random 12-byte IV and a full 16-byte authentication tag, and the id of its entry is authenticated along with it, so a ciphertext copied onto another entry does not decrypt.
- In the app, values are decrypted only for the vault page, after you confirmed your identity. A revealed value is shown for 30 seconds, and a copied one goes straight to the clipboard. Revealing, copying and changing a value are recorded in the audit log.
- The search, the REST API and the MCP server see names, addresses and descriptions only.
- `ENCRYPTION_KEY` is never part of a backup or an export, and error messages about it name the variable, never its value. Keep it apart from your backups: without it, the vault of a restored backup cannot be read. `node cli.js vault:rotate-key` encrypts every value again with a new key in one transaction, see [Operations](operations.md).

See [Vault](vault.md) for using the vault.

## Content and uploads

- Note content is checked on the server against the editor's schema. Unknown elements are refused, links may use only `http`, `https` or `mailto`, and images must be files uploaded to this Manifold. Raw HTML in Markdown is dropped.
- Service addresses must start with `http://` or `https://`, so a link in the sidebar cannot run a script. Manifold never fetches them itself.
- Uploads are recognized from their content, never from the file name or the type the client claims. Note images and API uploads must be PNG, JPEG, WebP or GIF images. Service icons may also be SVG, which must be UTF-8 and may not contain scripts, embedded documents, event handlers, entity declarations or references to other addresses; SVG is only ever shown as an image.
- An upload may be as large as `UPLOAD_MAX_BYTES`, 10 MB unless changed. Other request bodies are limited to 5 MB, and a body sent in chunks without a length is refused.
- Files are stored under random names in `UPLOAD_DIR`. They are served only to the signed-in owner and to keys with `files:read`, with their exact type, `X-Content-Type-Options: nosniff`, a sandboxing Content Security Policy and an inline disposition, so a file never runs as a page. They are not scanned for viruses: only images are accepted, and they are never run.
- A file that nothing refers to any more is deleted by the daily housekeeping.
- A restore accepts only the files a Manifold backup contains, and checks the restored uploads like new ones; see [Backups and restores](backups.md). Restore only archives you made: the database dump is applied as it is.

## Limits

| Limit                                           | Scope           | Value                                       |
| ----------------------------------------------- | --------------- | ------------------------------------------- |
| Sign-in attempts (password, codes, resets)      | Client address  | 5 per minute                                |
| Requests for emailed codes                      | Client address  | 3 per minute                                |
| Identity confirmations                          | Client address  | 5 per minute                                |
| Wrong passwords or codes in a signed-in session | Account         | 5 per minute, then refused until it is over |
| Second step of a sign-in                        | Sign-in attempt | 5 wrong codes, locked 15 minutes after 10   |
| REST, MCP and file requests with a key          | API key         | `API_RATE_LIMIT_PER_MINUTE`, 120 per minute |
| Image uploads from the editor                   | Account         | 30 per minute                               |
| Data exports                                    | Installation    | One at a time                               |
| Upload size                                     | Request         | `UPLOAD_MAX_BYTES`, 10 MB                   |
| Other request bodies                            | Request         | 5 MB                                        |
| Map feature                                     | Feature         | 10,000 points                               |

The number of notes, files, vault entries and keys is bounded only by the disk. The limits live in the app's memory, so they start over when the app restarts; run one app container per database, as [Deployment](deployment.md) explains.

## Browser protection

- Every response carries `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Cross-Origin-Opener-Policy: same-origin`, `X-Robots-Tag: noindex, nofollow`, and a `Permissions-Policy` that allows only geolocation, for the map's location button, and turns off camera, microphone, payment and USB. When `ORIGIN` starts with `https://`, `Strict-Transport-Security` asks browsers to use HTTPS for a year, subdomains included. The app's own server entry sets these headers before anything else, so the static files of the build carry them too.
- Pages carry a Content Security Policy. Scripts load only from Manifold itself, with a nonce for every response, and connections, fonts and form targets are limited to Manifold too; the base address may not be changed. Plugins are off, and no other site may frame the app. Styles may be inline, because Svelte's transitions write them, and images may come from any `https` address, because the map tile server is configured at runtime. Every other response gets a policy that allows nothing at all.
- Pages, data and form answers are sent with `Cache-Control: no-store`, so they are not kept in caches, and text is declared as UTF-8.
- Form submissions that change data are accepted only from Manifold's own origin; a form posted from another site is refused with `403`. The API under `/api/` is left out of this check, because it accepts only bearer keys, never cookies. The methods `TRACE`, `TRACK` and `CONNECT` are refused.
- After signing in, confirming your identity or changing the theme, Manifold goes back only to an address on its own site, whatever the `redirectTo` parameter says.
- Pages behind the sign-in send visitors without a session to the sign-in page, and every other request without a session is answered with `401`.

## Audit log

The audit log under **Settings → Security** records:

- Sign-ins, failed sign-ins and sign-outs, failed password reset codes, and sessions that reached their maximum age.
- Confirmations of your identity, and failed ones.
- Changes of the email address and the password, password resets, two-factor authentication turned on or off, new backup codes and ended sessions.
- API keys created and revoked.
- Vault entries created, changed and deleted, and values revealed, copied or changed.
- The data export.
- Every write through the REST API and the MCP server.
- The commands that change data on the server: migrations, owner recovery, key rotation, backups and restores.

Each event holds the time, the actor (**Owner**, **API key**, **Command line** or **System**), the action, the record it concerns, the client's address and user agent, and further details. Events never contain passwords, codes, keys, tokens or vault values. You can filter the log by actor, action and date; times and dates are in UTC.

The log is append-only: the database refuses to change or delete events, except for the daily housekeeping, which deletes events older than `AUDIT_RETENTION_DAYS` days, 180 unless changed. Every event is also written to the application log, so it can be kept by a system outside the server. A failure to write an event is logged and never blocks the action itself. See [Your account](account.md) for reading the log.

## Logging

The application writes one JSON object per line to standard output, and errors to standard error, with the time in UTC, the level and a message. It logs:

- applied migrations, the creation of the owner and the start of the server;
- every audit event, at level `info` with the message `Audit event`;
- security events at level `warn` with the message `Security event`: missing and invalid API keys, refused scopes, rate limits, blocked credential checks, cross-site form posts, oversized bodies and rejected uploads, with the address and the path;
- unexpected errors at level `error` with an id, the route and the stack; the visitor sees only a generic message and the same id to quote.

The log never contains passwords, codes, keys, cookies, tokens, `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY` or the contents of notes and the vault. Read it with `docker compose logs app` and keep it with Docker's log options, see [Operations](operations.md).

## Cryptography and keys

| What                               | How                                                                         | Key or secret                   |
| ---------------------------------- | --------------------------------------------------------------------------- | ------------------------------- |
| Passwords                          | scrypt, N = 2^15, r = 8, p = 3, 16-byte salt, 64-byte key                   | none                            |
| Vault values                       | AES-256-GCM, random 12-byte IV, 16-byte tag, entry id as additional data    | `ENCRYPTION_KEY`                |
| Session cookies                    | random session tokens, signed with HMAC-SHA256                              | `BETTER_AUTH_SECRET`            |
| Authenticator secret, backup codes | encrypted by Better Auth                                                    | `BETTER_AUTH_SECRET`            |
| Authenticator codes                | TOTP, HMAC-SHA1, six digits, 30 seconds, as authenticator apps expect       | the secret shared with your app |
| API keys, emailed codes            | stored as SHA-256 hashes; keys have 32 random bytes                         | none                            |
| Browser fingerprints for notices   | SHA-256 of the user agent                                                   | none                            |
| Transport                          | TLS at the reverse proxy; SMTP with TLS 1.2 or newer and certificate checks | the certificates                |

All random values come from the operating system's cryptographic source through Node's `crypto` module.

Managing the two secrets:

- **Creating:** generate both with `openssl rand -base64 32` when you install Manifold, and never reuse them elsewhere.
- **Storing:** they live only in the environment, or in files named by `BETTER_AUTH_SECRET_FILE` and `ENCRYPTION_KEY_FILE`, such as Docker secrets. Keep copies in a password manager, apart from the backups: backups contain neither.
- **Rotating `ENCRYPTION_KEY`:** `node cli.js vault:rotate-key` encrypts every value again with the new key; then set the new key and restart.
- **Rotating `BETTER_AUTH_SECRET`:** turn two-factor authentication off, set the new secret and restart, which signs everyone out, then set up two-factor authentication again. [Operations](operations.md) describes both procedures.
- **Losing them:** without `ENCRYPTION_KEY` the vault values cannot be recovered; without `BETTER_AUTH_SECRET`, turn two-factor authentication off with `owner:disable-2fa` and sign in again.

## Data

| Class       | Data                                                                                                      | Protection                                                                                       |
| ----------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Secret      | Vault values, passwords, API keys, emailed codes, the authenticator secret, backup codes, the two secrets | Encrypted or hashed at rest, never logged, never in API answers, shown only after a confirmation |
| Private     | Notes, map features, services, uploaded files, the audit log, sessions and settings                       | Only for the signed-in owner and scoped keys, in the database or the upload folder, in backups   |
| Operational | Logs, health status                                                                                       | Without secrets or content                                                                       |

Backups hold the secret and private classes in the form they are stored, so protect them like the live data.

## Connections

Manifold connects only to:

- the PostgreSQL database;
- the SMTP server, when `SMTP_HOST` is set;

and, outside the app:

- your browser loads map tiles from `MAP_TILE_URL`, OpenStreetMap unless changed;
- the release workflow on GitHub calls your Coolify deploy webhook, when you set it up, see [Deployment](deployment.md).

The server never fetches service addresses or anything else from the internet at runtime, and it sends no telemetry.

## Server and container

- The environment is checked on start. A missing or malformed variable stops the app with a message that names the variable, never its value. `BETTER_AUTH_SECRET` must have at least 32 characters, `ENCRYPTION_KEY` must decode from base64 to exactly 32 bytes, and the example database password from `.env.example` is refused when `ORIGIN` is an `https` address. Secrets may come from files through the `*_FILE` variables, see [Configuration](configuration.md).
- The image runs as the unprivileged `node` user and ships without npm, Corepack or Yarn. It contains a CycloneDX software bill of materials of its dependencies at `/app/sbom.cdx.json`.
- In `docker-compose.yml`, the app runs with a read-only root filesystem, without any Linux capabilities and with `no-new-privileges`. Only its data volume at `/data` and a temporary `/tmp` are writable. The database runs with `no-new-privileges` as well.
- The database publishes no port, and the app is published only on `127.0.0.1:3000`, for a reverse proxy on the same host that terminates TLS. See [Deployment](deployment.md). The app connects to the database as the account the database image creates, which owns it; only the app can reach the database, on Compose's own network.

## Your part

- Keep `BETTER_AUTH_SECRET` and `ENCRYPTION_KEY` secret, and store copies apart from your backups.
- Remove `OWNER_PASSWORD` from the environment after the first start; Manifold ignores it once the owner exists.
- Run Manifold behind a reverse proxy with TLS, set `ORIGIN` to its `https://` address and keep port 3000 private. Set `ADDRESS_HEADER` and `XFF_DEPTH` to match your proxy, so that rate limits and the audit log see real client addresses. See [Configuration](configuration.md).
- Turn on two-factor authentication and keep the backup codes somewhere safe.
- Give API keys the smallest scopes that work and an expiry date where you can, give clients `https` addresses, and revoke keys that are no longer used.
- Take backups, copy them off the server and protect them like the live data. See [Backups and restores](backups.md).
- Update to new versions promptly.
