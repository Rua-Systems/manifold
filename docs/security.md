# Security

Manifold keeps your notes, your places and the passwords in your vault, so it is built to run on the public internet behind a single owner account. This page summarizes how it protects the account and the data. To report a vulnerability, follow [SECURITY.md](../SECURITY.md) instead of opening a public issue.

## Accounts and sign-in

- There is exactly one account, the owner. Manifold creates it from `OWNER_USERNAME`, `OWNER_EMAIL` and `OWNER_PASSWORD` on the first start, when no user exists, and ignores these variables afterwards. There is no sign-up: it is turned off, and a check before every account creation refuses a second user.
- You sign in with your username or email address and your password or, when email is set up, with a six-digit code that is sent to your address and is valid for five minutes. See [Your account](account.md) and [Email](email.md).
- Passwords have 8 to 128 characters and are hashed with scrypt by Better Auth, the authentication library Manifold uses.
- Sign-in attempts are limited to 5 per minute per client address. The limit covers passwords, emailed codes, second-factor codes and password resets. Requests for emailed codes are limited to 3 per minute. These limits need the real client address, so set up the reverse proxy as described in [Deployment](deployment.md).
- A wrong username and a wrong password get the same answer. Emailed codes are sent in the background, so the response time does not tell whether an address belongs to the owner.
- Failed sign-ins are recorded in the audit log with the method, the address and the device, but without the name that was typed, since a mistyped password can end up in that field.
- When email is set up, Manifold mails you when someone signs in from a browser it has not seen before, and when your password changes. It remembers browsers only as a SHA-256 hash of their user agent.
- Resetting a forgotten password needs an emailed code and signs out every session. Without email, you reset the password on the server with `node cli.js owner:reset-password`, see [Operations](operations.md).

## Two-factor authentication

- Two-factor authentication uses authenticator apps (TOTP). You turn it on under **Settings → Security**: choose **Set Up**, enter your password, scan the QR code, enter the first code and choose **Turn On**.
- Turning it on gives you 10 backup codes, each of which signs you in once when the authenticator app is not at hand. They are shown only once. **Create New Codes** replaces all of them.
- Once it is on, every sign-in asks for a code after the password or the emailed code. The second step must be finished within ten minutes and allows five wrong codes before you have to start over. After 10 wrong codes in a row, the second step is locked for 15 minutes.
- Turning two-factor authentication off and creating new backup codes ask for your password and a current code in the same form.
- The authenticator secret and the backup codes are stored encrypted under `BETTER_AUTH_SECRET`.
- If you lose both the authenticator app and the backup codes, `node cli.js owner:disable-2fa` on the server turns two-factor authentication off and signs out every session.

## Confirming your identity

Some actions need a fresh proof that it is you at the keyboard. The **Confirm Your Identity** dialog asks for your password, and for a code from your authenticator app when two-factor authentication is on, before you can:

- Change your email address or your password.
- Create an API key.
- Reveal, copy or change a vault value.
- Download the data export.

A confirmation lasts ten minutes and belongs to the current session, so another browser or a new sign-in has to confirm again. Confirmations and failed attempts are recorded in the audit log, and attempts are limited to 5 per minute per client address.

## Sessions

- Session cookies are `HttpOnly` and `SameSite=Lax`. When `ORIGIN` starts with `https://`, they are also `Secure` and carry the `__Secure-` prefix.
- A session lasts seven days and is extended while you use it.
- **Settings → Security** lists your sessions with their device, address, sign-in time and last activity. **Sign Out** ends one of them, and **Sign Out All Other Sessions** ends every session but the current one. The list works with session ids, never with the tokens that sign you in.
- Changing your password signs out your other sessions. Resetting it by email, and the commands `owner:reset-password` and `owner:disable-2fa`, sign out every session.

## API keys and MCP

- A key consists of a lookup prefix and 32 random bytes. Manifold stores only a SHA-256 hash of it and compares hashes in constant time. The key is shown once, when it is created, and creating one needs a confirmation of your identity.
- Every key carries scopes per module, and a write scope does not include the read scope. `vault:read` sees only names, addresses and descriptions: no API route and no MCP tool returns or accepts a vault value.
- A key can expire on a date you choose, and revoking it takes effect at once. Unknown, revoked and expired keys get the same answer.
- The REST API and the MCP server accept keys only in the `Authorization` header and never read cookies, so a signed-in browser cannot be turned against them.
- Each key may make `API_RATE_LIMIT_PER_MINUTE` requests per minute, 120 unless changed, across REST and MCP together.
- Every write through a key is recorded in the audit log, and the key list shows when and from which address each key was last used.

See [REST API](api.md) and [MCP server](mcp.md) for the details.

## The vault

- Vault values are encrypted with AES-256-GCM under `ENCRYPTION_KEY`, 32 random bytes that the app checks on start. Every value gets its own random 12-byte IV, and the id of its entry is authenticated along with it, so a ciphertext copied onto another entry does not decrypt.
- In the app, values are decrypted only for the vault page, after you confirmed your identity. A revealed value is shown for 30 seconds, and a copied one goes straight to the clipboard. Revealing, copying and changing a value are recorded in the audit log.
- The search, the REST API and the MCP server see names, addresses and descriptions only.
- `ENCRYPTION_KEY` is never part of a backup or an export, and error messages about it name the variable, never its value. Keep it apart from your backups: without it, the vault of a restored backup cannot be read. `node cli.js vault:rotate-key` encrypts every value again with a new key in one transaction, see [Operations](operations.md).

See [Vault](vault.md) for using the vault.

## Content and uploads

- Note content is checked on the server against the editor's schema. Unknown elements are refused, links may use only `http`, `https` or `mailto`, and images must be files uploaded to this Manifold. Raw HTML in Markdown is dropped.
- Service addresses must start with `http://` or `https://`, so a link in the sidebar cannot run a script.
- Uploads are recognized from their content, never from the file name or the type the client claims. Note images and API uploads must be PNG, JPEG, WebP or GIF images. Service icons may also be SVG, which is only ever shown as an image, where scripts do not run.
- An upload may be as large as `UPLOAD_MAX_BYTES`, 10 MB unless changed. Other request bodies are limited to 5 MB, and a body sent in chunks without a length is refused.
- Files are stored under random names in `UPLOAD_DIR`. They are served only to the signed-in owner and to keys with `files:read`, with their exact type, `X-Content-Type-Options: nosniff`, a sandboxing Content Security Policy and an inline disposition, so a file never runs as a page.
- A file that nothing refers to any more is deleted by the daily housekeeping.

## Browser protection

- Pages carry a Content Security Policy. Scripts load only from Manifold itself, with a nonce for every response, and connections, fonts, form targets and the base address are limited to Manifold too. Plugins are off, and no other site may frame the app. Styles may be inline, because Svelte's transitions write them, and images may come from any `https` address, because the map tile server is configured at runtime.
- Pages and endpoints send `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Robots-Tag: noindex, nofollow`, and a `Permissions-Policy` that allows only geolocation, for the map's location button, and turns off camera, microphone, payment and USB. When `ORIGIN` starts with `https://`, `Strict-Transport-Security` asks browsers to use HTTPS for a year, subdomains included.
- Form submissions that change data are accepted only from Manifold's own origin; a form posted from another site is refused with `403`. The API under `/api/` is left out of this check, because it accepts only bearer keys, never cookies.
- Pages behind the sign-in send visitors without a session to the sign-in page, and every other request without a session is answered with `401`.

## Audit log

The audit log under **Settings → Security** records:

- Sign-ins, failed sign-ins and sign-outs.
- Confirmations of your identity, and failed ones.
- Changes of the email address and the password, password resets, two-factor authentication turned on or off, new backup codes and ended sessions.
- API keys created and revoked.
- Vault entries created, changed and deleted, and values revealed, copied or changed.
- The data export.
- Every write through the REST API and the MCP server.
- The commands that change data on the server: migrations, owner recovery, key rotation, backups and restores.

Each event holds the time, the actor (**Owner**, **API key**, **Command line** or **System**), the action, the record it concerns, the client's address and user agent, and further details. Events never contain passwords, codes, keys, tokens or vault values. You can filter the log by actor, action and date; times and dates are in UTC.

Events are kept for `AUDIT_RETENTION_DAYS` days, 180 unless changed, and then deleted by the daily housekeeping. A failure to write an event is logged and never blocks the action itself. See [Your account](account.md) for reading the log.

## Server and container

- The environment is checked on start. A missing or malformed variable stops the app with a message that names the variable, never its value. `BETTER_AUTH_SECRET` must have at least 32 characters, and `ENCRYPTION_KEY` must decode from base64 to exactly 32 bytes.
- The image runs as the unprivileged `node` user and ships without npm, Corepack or Yarn. It contains a CycloneDX software bill of materials at `/app/sbom.cdx.json`.
- In `docker-compose.yml`, the app runs with a read-only root filesystem, without any Linux capabilities and with `no-new-privileges`. Only its data volume at `/data` and a temporary `/tmp` are writable. The database runs with `no-new-privileges` as well.
- The database publishes no port, and the app is published only on `127.0.0.1:3000`, for a reverse proxy on the same host that terminates TLS. See [Deployment](deployment.md).

## Your part

- Keep `BETTER_AUTH_SECRET` and `ENCRYPTION_KEY` secret, and store `ENCRYPTION_KEY` apart from your backups.
- Remove `OWNER_PASSWORD` from the environment after the first start; Manifold ignores it once the owner exists.
- Run Manifold behind a reverse proxy with TLS, set `ORIGIN` to its `https://` address and keep port 3000 private. Set `ADDRESS_HEADER` and `XFF_DEPTH` to match your proxy, so that rate limits and the audit log see real client addresses. See [Configuration](configuration.md).
- Turn on two-factor authentication and keep the backup codes somewhere safe.
- Give API keys the smallest scopes that work and an expiry date where you can, and revoke keys that are no longer used.
- Take backups, copy them off the server and protect them like the live data. See [Backups and restores](backups.md).
- Update to new versions promptly.
