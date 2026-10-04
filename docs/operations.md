# Operations

This page covers the tasks of running an installation: the command line, backups, recovering the owner account, ending sessions, rotating the vault key and the sign in secret, housekeeping, logs, the health check and updates.

## Command line

Operational tasks that must never be reachable over the network run through a command line tool inside the app container:

```bash
docker compose exec app node cli.js <command>
```

| Command                    | Purpose                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| `migrate`                  | Applies pending database migrations. The app also applies them on every start.                   |
| `owner:show`               | Prints the owner's username and email address.                                                   |
| `owner:reset-password`     | Asks for a new owner password and signs out every session.                                       |
| `owner:disable-2fa`        | Turns two factor authentication off for the owner and signs out every session.                   |
| `vault:rotate-key`         | Encrypts every vault value again with a new `ENCRYPTION_KEY`.                                    |
| `backup [path]`            | Writes a backup archive with the database and the uploaded files, by default to `/data/backups`. |
| `restore <path> [--force]` | Restores a backup archive, then applies the migrations that are newer than the backup.           |

`node cli.js help` prints the same list. The tool reads the same environment as the app and checks it with the same rules, so a configuration error stops it with the same message as the app, see [Troubleshooting](troubleshooting.md). It exits with status `0` on success and `1` on any error, which makes it usable from scripts. Passwords and keys that it asks for are not shown while you type them.

Commands that change something are written to the audit log under **Settings → Security → Audit Log**, with the actor **Command line**:

| Command                | Audit action                                          |
| ---------------------- | ----------------------------------------------------- |
| `migrate`              | `database.migrate`, only when a migration was applied |
| `owner:reset-password` | `auth.password_reset`                                 |
| `owner:disable-2fa`    | `auth.two_factor_disable`                             |
| `vault:rotate-key`     | `vault.rotate_key`                                    |
| `backup`               | `data.backup`                                         |
| `restore`              | `data.restore`                                        |

`docker compose exec` needs a running app container. When the app does not start, run the command in a one-off container with the same configuration and volumes instead:

```bash
docker compose run --rm app node cli.js <command>
```

On a platform where you cannot run Docker Compose in a shell, such as Coolify, open a terminal in the app container and run `node cli.js <command>` there. `/app` is the working directory of the image.

In a development checkout, build the app first, then run the tool through npm. It reads `.env`:

```bash
npm run build
```

```bash
npm run cli -- owner:show
```

[Development](development.md) describes the development setup.

## Backups

[Backups and restores](backups.md) describes backups in detail. From the command line:

```bash
docker compose exec app node cli.js backup
```

The command writes `/data/backups/manifold-backup-<time>.tar.gz` with a manifest, a dump of the whole database and every uploaded file. `ENCRYPTION_KEY` is never part of an archive: keep it safe on its own, or the vault of a restored backup cannot be read. The same archive can be downloaded in the browser with **Download Export** under **Settings → Data**.

A backup inside the same volume does not protect against losing the server. Copy every archive somewhere else:

```bash
docker compose cp app:/data/backups/manifold-backup-2026-09-30T03-00-00.tar.gz ./
```

Manifold has no backup schedule of its own. To create a backup every night at 03:00, add a line like this to the host's crontab (`crontab -e`), with the folder that holds `docker-compose.yml`:

```text
0 3 * * * cd /opt/manifold && docker compose exec -T app node cli.js backup >> /var/log/manifold-backup.log 2>&1
```

`-T` runs the command without a terminal, as cron requires. Archives are never deleted automatically; remove old ones from `/data/backups` once they are stored safely elsewhere.

## Recovering the owner account

To find out which account is the owner:

```bash
docker compose exec app node cli.js owner:show
```

### Forgotten password

When email is set up, choose **Forgot Password** on the login page. A code is mailed to the owner's address; enter it with a new password on the **Reset Password** page. Every session is signed out, see [Email](email.md).

Without email, or without access to the mailbox, set a new password on the command line:

```bash
docker compose exec app node cli.js owner:reset-password
```

The command asks for the new password twice. It must be 8 to 128 characters long. The command then changes the password, signs out every session and writes an audit entry. Two factor authentication stays as it was.

### Lost second factor

Without your authenticator app, sign in with one of your backup codes: choose **Backup code** in the second step of the login. Without backup codes, turn two factor authentication off on the command line:

```bash
docker compose exec app node cli.js owner:disable-2fa
```

The command asks you to type `yes`, then turns two factor authentication off, deletes the authenticator secret and the backup codes, and signs out every session. Sign in with the password and set up two factor authentication again under **Settings → Security**.

There is deliberately no environment variable for any of this. `OWNER_USERNAME`, `OWNER_EMAIL` and `OWNER_PASSWORD` only create the owner on the first start; once an account exists, they are ignored and the log says that they can be removed.

## Ending sessions

**Settings → Security → Sessions** lists every signed in browser with its device, IP address and last activity. **Sign Out** ends one session, and **Sign Out All Other Sessions** ends every session except the current one; both ask you to confirm your identity first. Changing the password under **Settings** also signs out every other session, and every session ends 30 days after its sign in at the latest.

Both `owner:reset-password` and `owner:disable-2fa` sign out every session, including your own. Changing `BETTER_AUTH_SECRET` signs out every browser as well.

## Rotating the vault key

`ENCRYPTION_KEY` encrypts the values in the [vault](vault.md). Replace it right away when it may have leaked:

1. Create a new key of 32 random bytes:

   ```bash
   openssl rand -base64 32
   ```

2. Encrypt the vault again with the new key. The command takes the key from `NEW_ENCRYPTION_KEY` when that variable is set, and otherwise asks for it:

   ```bash
   docker compose exec app node cli.js vault:rotate-key
   ```

   Every value is decrypted with the current key and encrypted with the new one in a single transaction, so the vault is never half rotated. The command reports how many values it encrypted again. If the current key cannot open every value, it stops with `The current ENCRYPTION_KEY does not open every value. Nothing was changed.`

3. Set `ENCRYPTION_KEY` to the new key in `.env`, or in Coolify's environment settings, and recreate the app container so it reads the new value:

   ```bash
   docker compose up -d
   ```

   Until then, the running app still holds the old key and cannot read the vault. `docker compose restart` is not enough, because it does not apply changed environment values.

4. Create a new backup. Archives made before the rotation hold the vault encrypted with the old key: keep the old key together with them, or delete them once the new backup is stored safely.

## Changing the sign in secret

`BETTER_AUTH_SECRET` signs the session cookies and encrypts the authenticator secret and the backup codes of two factor authentication. Replacing it:

- signs out every browser;
- makes the stored authenticator secret and backup codes unreadable, so a sign in with two factor authentication no longer works;
- leaves the password, API keys and the vault untouched.

To replace it:

1. If two factor authentication is on, turn it off first under **Settings → Security** with **Turn Off Two Factor Authentication**.
2. Set `BETTER_AUTH_SECRET` to a new random value of at least 32 characters, for example from `openssl rand -base64 32`.
3. Recreate the app container:

   ```bash
   docker compose up -d
   ```

4. Sign in with the password, set up two factor authentication again and store the new backup codes.

If you changed the secret while two factor authentication was on, run `owner:disable-2fa` and continue with step 4.

## Housekeeping

The app cleans up after itself once when it starts and then every 24 hours:

| Task                       | What it removes                                                                                                               |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `notes.purge-trash`        | Notes that have been in the trash for longer than `TRASH_RETENTION_DAYS` (default 30).                                        |
| `files.purge-unreferenced` | Uploaded files older than a day that no note and no service refers to any more, from the database and from the upload folder. |
| `audit.purge`              | Audit events older than `AUDIT_RETENTION_DAYS` (default 180).                                                                 |

The trash is emptied first, so images of purged notes are removed in the same run. A task that fails is logged as `Housekeeping task failed` with the task's name, and the other tasks still run. The 24 hour interval starts with the app, so every restart runs all tasks once more.

## Logs

Manifold writes one JSON object per line to standard output, and errors to standard error. Read them with:

```bash
docker compose logs -f app
```

Every line has `time` (UTC), `level` (`info`, `warn` or `error`) and `message`, and further fields that depend on the message, for example:

```json
{
  "time": "2026-09-30T03:00:00.000Z",
  "level": "warn",
  "message": "Security event",
  "event": "invalid_key",
  "path": "/api/v1/notes",
  "ip": "203.0.113.24"
}
```

The log contains:

- the start of the app: the migrations it applied (`Applied migrations`), the creation of the owner account on the first start, and the address it listens on;
- every audit event (`Audit event`, with the action, the actor, the target and the address), so the audit log can be kept outside the server as well;
- security events (`Security event`, at level `warn`): missing and invalid API keys, refused scopes, rate limits, blocked credential checks, cross-site form posts, oversized bodies and rejected uploads;
- errors that the app caught, such as `Sending a mail failed`, `Housekeeping task failed`, `The export failed`, `API request failed` or `MCP tool failed`, with the error message and stack;
- unexpected errors of pages and form actions (`Request failed`), with an `id` that the error page shows as well, so a visitor can quote it.

Configuration errors that stop the start are printed as text and name the variable and the rule, never the value. The log never contains passwords, codes, keys, cookies, tokens, the two secrets or the contents of notes and the vault; failed mails are logged without their content, and errors of the backup tools never include the database connection string.

Docker keeps the log of a container until it is removed. Limit its size with Docker's log options, see [Deployment](deployment.md), and ship it to a log system of your choice if you want to keep it longer than the server.

## Health check

`GET /healthz` returns `{"status":"ok"}` while the database responds, and `503` with `{"status":"unavailable"}` otherwise. The image's health check calls it every 30 seconds, and `docker compose ps` shows the container as `healthy` or `unhealthy`. On the server:

```bash
curl http://127.0.0.1:3000/healthz
```

Docker only marks an unhealthy container; the `restart: unless-stopped` policy restarts the app when its process exits, not when the health check fails.

## Updating

1. Create a backup and copy it off the server.
2. Choose the image in `.env` with `MANIFOLD_VERSION`: `latest`, a release such as `0.3.0`, or a minor line such as `0.3`.
3. Pull the image:

   ```bash
   docker compose pull app
   ```

4. Start the new version:

   ```bash
   docker compose up -d
   ```

Pending migrations run on start, and the log lists them. A version never runs on a database that a newer version has migrated: it stops at start with `The database has migration ... applied, but this build has no such file.` To go back to an older version, restore a backup that was made with it, see [Backups and restores](backups.md). To build the image from a checkout of the repository instead of pulling it, run `docker compose up -d --build`, see [Deployment](deployment.md).

## Software bill of materials

Every image contains a CycloneDX software bill of materials of its production dependencies at `/app/sbom.cdx.json`:

```bash
docker compose exec app cat /app/sbom.cdx.json
```

In a checkout of the repository, `npm run --silent sbom` prints the same list.

## Dependency updates

Dependabot proposes updates for npm packages, GitHub Actions and the base image every week. Minor and patch updates of npm packages arrive together in one pull request. New major versions of Node.js for the base image, of `@types/node` and of TypeScript are not proposed automatically. Continuous integration runs `npm audit` through `scripts/audit.ts` and fails on known vulnerabilities of high or critical severity. The script accepts only advisories that have no fixed release yet and reach the project through build tools alone, each with its reason. Pull or rebuild the image regularly to pick up updates of the base image.
