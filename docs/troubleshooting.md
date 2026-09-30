# Troubleshooting

This page collects common problems and how to solve them. The application log usually tells what went wrong:

```bash
docker compose logs --tail 100 app
```

[Operations](operations.md) describes what the log contains.

## The app does not start

Before anything starts, Docker Compose checks that `ORIGIN`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `BETTER_AUTH_SECRET` and `ENCRYPTION_KEY` are set, and refuses to start with the name of the one that is missing or empty.

The app then checks every variable. When one is wrong, it stops, and the log shows `Invalid environment configuration:` followed by one line per problem, for example:

```text
Invalid environment configuration:
  - BETTER_AUTH_SECRET: Use at least 32 characters.
  - ENCRYPTION_KEY: Expected 32 random bytes, base64 encoded.
```

Fix every listed variable in `.env` and run `docker compose up -d`. Typical messages:

| Message                                                                                   | Fix                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ORIGIN: Expected an http or https URL.`                                                  | Set `ORIGIN` to the public address, such as `https://manifold.example.com`.                                                                                                         |
| `ORIGIN: Remove the trailing slash.`                                                      | Write the address without a `/` at the end.                                                                                                                                         |
| `DATABASE_URL: Expected a postgres:// connection string.`                                 | Start the value with `postgres://` or `postgresql://`. `docker-compose.yml` builds it from the `POSTGRES_*` variables.                                                              |
| `BETTER_AUTH_SECRET: Use at least 32 characters.`                                         | Generate a value with `openssl rand -base64 32`.                                                                                                                                    |
| `ENCRYPTION_KEY: Expected 32 random bytes, base64 encoded.`                               | Generate a key with `openssl rand -base64 32`. Never replace the key of an installation whose vault holds values; rotate it as described in [Operations](operations.md).            |
| `MAP_DEFAULT_CENTER: Expected "lon,lat" in degrees.`                                      | Write the longitude and the latitude separated by a comma, for example `13.4,52.5`.                                                                                                 |
| `DATABASE_URL: Replace the example database password with a new one.`                     | `POSTGRES_PASSWORD` is still `change-me` from `.env.example`. Choose a new one; for an existing database, change it inside PostgreSQL first, see [Configuration](configuration.md). |
| `BETTER_AUTH_SECRET: Set either BETTER_AUTH_SECRET or BETTER_AUTH_SECRET_FILE, not both.` | Remove one of the two; the same applies to the other `_FILE` variables.                                                                                                             |
| `ENCRYPTION_KEY_FILE: The file cannot be read.`                                           | The path in the `_FILE` variable does not exist in the container, or the app may not read it.                                                                                       |

Other lines name the variable in the standard wording of the validation library, for example for a missing value, for `SMTP_SECURE` with a value other than `true` or `false`, or for a number such as `UPLOAD_MAX_BYTES` that is not a positive whole number. The command line tool checks the same variables and prints the same message. [Configuration](configuration.md) describes every variable.

On the first start, the app creates the owner account and stops when a variable for it is missing or invalid:

```text
No owner account exists yet, so OWNER_USERNAME, OWNER_EMAIL and OWNER_PASSWORD are needed to create it:
  - OWNER_PASSWORD must be at least 8 characters
```

Set all three: a username of 3 to 32 lowercase letters, digits, `.`, `_` or `-`, a valid email address, and a password of 8 to 128 characters. `OWNER_PASSWORD is a common password; choose another one` and `OWNER_PASSWORD must not contain the product, organization or account name` mean what they say: choose a password that is not a common one and does not contain `manifold`, the organization name, the username or the email address.

If the app cannot connect to the bundled database right after a new installation, check that `POSTGRES_PASSWORD` uses only letters, digits, `-`, `_`, `.` and `~`: it becomes part of `DATABASE_URL`.

A variable you changed has no effect: `docker compose restart` keeps the old values. Run `docker compose up -d`, which recreates the container with the new ones.

## Migrations stop the start

Migrations run on every start, each in its own transaction. When one of them cannot run, the app stops with one of these messages:

- **`Migration 0005_notes_init.sql changed after it was applied (checksum mismatch). Applied migrations must never be edited; add a new migration instead.`**: a migration file of this build differs from the one that ran on the database. This happens with a checkout whose migration files were changed. Line endings are ignored for the check, so a Windows checkout is not the cause. Use the unchanged migration files of the release.
- **`The database has migration 0012 applied, but this build has no such file. It was probably created by a newer version of Manifold.`**: an older version runs on a database that a newer version has migrated. Start the newer version again, or go back to the older version with a backup, see [Backups and restores](backups.md).
- **`Migration 0001_core_init.sql failed: ...`** with an external database: the database role must be allowed to create the `postgis` and `pg_trgm` extensions.
- **`Migration ... failed: ...`** after an update: the failed migration was rolled back. Restore the backup you made before the update and report the problem.

## Signing in does not work

- **`Cross-site POST form submissions are forbidden`**: the address in the browser differs from `ORIGIN`, so every form is refused. Open Manifold exactly at the address in `ORIGIN`. `http://localhost:3000` and `http://127.0.0.1:3000` are different origins, and so are `http` and `https`. With an `https` origin, the session cookie is only stored over `https` as well.
- **Every sign in ends on an error page, and the log shows `Address header was specified with ADDRESS_HEADER=x-forwarded-for but is absent from request`**: `docker-compose.yml` expects a reverse proxy in front of the app by default. When you reach the app without one, set both variables to nothing in `.env` and run `docker compose up -d`:

  ```ini
  ADDRESS_HEADER=
  XFF_DEPTH=
  ```

- **`XFF_DEPTH is 2, but only found 1 addresses`**: `XFF_DEPTH` is higher than the number of proxies in front of the app. Set it to that number, see [Deployment](deployment.md).
- **The audit log shows the same address for every sign in**: the app sees the proxy as the client of every request, so every visitor also shares one rate limit. Set `ADDRESS_HEADER` and `XFF_DEPTH` for your proxy.
- **"Too many attempts. Wait a minute and try again."**: each client address may make 5 sign in attempts per minute, counting passwords and codes, request 3 emailed codes per minute and confirm its identity 5 times per minute. The counters are kept in the app's memory and start over after a restart.
- **"Too many attempts. Wait a minute and try again." while signed in**: five wrong passwords or codes within a minute, in the identity confirmation, the password change or the two factor settings, block these forms for the rest of the minute, from every address.
- **"That code is not valid." for a code that was just right**: an authenticator code works only once. Wait for the next code of the app.
- **You are signed out after about a month although you use Manifold every day**: sessions end 30 days after their sign in at the latest. Sign in again.
- **"Too many wrong codes. Try again in 15 minutes."**: after 10 wrong codes in a row in the second step, the account's second factor is locked for 15 minutes. Wait, then try again.
- **"The sign in took too long. Start again."**: the second step expired after ten minutes, or too many wrong codes were entered in it. Sign in again from the start.
- **"That code was not accepted."** for an emailed code: the code expired after 5 minutes, or it was entered wrong three times. Request a new one.
- **There is no Email Code option and no Forgot Password link**: email is off. See [Email](email.md).
- **The authenticator code fails after changing `BETTER_AUTH_SECRET`, or after restoring a backup made under another secret**: the stored authenticator secret was encrypted with a different `BETTER_AUTH_SECRET`. Run `owner:disable-2fa` and set two factor authentication up again, see [Operations](operations.md).
- **A forgotten password or a lost authenticator**: see [Recovering the owner account](operations.md).

## Emails do not arrive

- Check the log for `Sending a mail failed`, with the reason in the `error` field.
- The server must offer TLS 1.2 or newer with a valid certificate: either implicit TLS on port 465 with `SMTP_SECURE=true`, or STARTTLS on port 587, which Manifold requires. Only a relay on `localhost` may be reached without TLS.
- Port `465` needs `SMTP_SECURE=true`; port `587` works with `SMTP_SECURE=false` and STARTTLS.
- Set `MAIL_FROM`. Most providers accept only a sender that belongs to the account in `SMTP_USER`.
- Codes are only sent to the owner's address. `owner:show` prints it.
- Messages that are sent but not delivered usually need SPF, DKIM and DMARC records for the sender's domain.
- **Email Code** and **Forgot Password** are missing: `SMTP_HOST` is not set in the environment of the running app. After editing `.env`, run `docker compose up -d`.

## Backups fail

- **`pg_dump is not installed. Install the PostgreSQL 17 client tools, or run the command in the app container.`**: the command runs outside the container, where neither `pg_dump` nor the development database container is available. Run it in the container, start the development database, or install the PostgreSQL 17 client tools.
- **`pg_dump failed:`** followed by a message about a server version mismatch: `pg_dump` cannot dump a server of a newer major version. The image ships the PostgreSQL 17 tools for the bundled PostgreSQL 17 database. On a development machine, client tools older than 17 fail the same way; install version 17.
- **`/app/backup.tar.gz cannot be written (EROFS).`**: the path lies outside `/data`, and the root filesystem of the container is read-only. Relative paths start at `/app`. Leave the path out, or use an absolute path such as `/data/backups/before-update.tar.gz`.
- **`... already exists. Choose another name.`**: the command never overwrites an archive.
- **An error with `ENOSPC`**: the volume is full. A backup needs room for the database dump in `/data/tmp` and for the archive. Delete old archives after copying them elsewhere, or enlarge the disk.
- **Download Export answers "An export is already running."**: exports run one at a time. Wait until the other download has finished.
- **Download Export ends on an error page, and the log shows `The export cannot run`**: the app cannot run `pg_dump`. The image always contains it; in development, install the PostgreSQL 17 client tools or start the development database.
- **The export download breaks off, and the log shows `The export failed`**: the `error` field names the reason.

## Restore refuses to run

- **`The database is not empty. Use --force to replace it.`**: once the app has started, the database always holds its tables. Add `--force` to replace everything.
- **`The backup comes from a newer Manifold (migration 0012, this one knows 0011). Update first.`**: update this installation to at least the version that made the backup, then restore it.
- **`The archive cannot be read.`**: the path is wrong, or the file is damaged or not a `.tar.gz` archive. Paths are inside the container: copy the archive into `/data/backups` first.
- **`The archive holds entries that are not part of a Manifold backup.`**: the archive contains files, folders or links that Manifold never writes. Use an archive that Manifold wrote, unchanged.
- **`Left out ... uploaded file(s) that are not images Manifold accepts.`**: some files in the archive's `uploads` folder are not images Manifold would accept today; they were not copied. Notes and services that used them show a missing image.
- **`pg_restore failed:`** followed by the reason: the restore stopped at the first error. With `--force`, the database may now be incomplete; fix the cause and run the restore again.

[Backups and restores](backups.md) lists every message. Nothing is changed when an archive is refused.

## The vault cannot be read

The vault lists its entries, but revealing or copying a value ends on an error page. The app runs with another `ENCRYPTION_KEY` than the one the values were encrypted with, usually after a restore or a move to another server. The app starts with any key of the right length, so it cannot notice this at start.

Set `ENCRYPTION_KEY` to the key that was current when the backup was made, and run `docker compose up -d`. Without that key, the values cannot be recovered: delete those entries and create them again.

Right after `vault:rotate-key`, the running app still holds the old key. Set the new key and run `docker compose up -d`, see [Operations](operations.md).

## API requests fail

Every error has a JSON body with an `error` object that holds a `code` and a `message`:

| Answer                   | Cause                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------ |
| `401 missing_key`        | No key was sent. Send it as `Authorization: Bearer <key>`.                                             |
| `401 invalid_key`        | The key is unknown, revoked or expired.                                                                |
| `403 insufficient_scope` | The key lacks the scope of this endpoint; the message names it.                                        |
| `413 payload_too_large`  | The body is larger than 5 MB, or an upload is larger than `UPLOAD_MAX_BYTES` plus 256 KB for the form. |
| `413 file_too_large`     | The uploaded file is larger than `UPLOAD_MAX_BYTES`.                                                   |
| `429 rate_limited`       | The key used up its requests for this minute. Wait for `Retry-After` seconds.                          |

Each key may make `API_RATE_LIMIT_PER_MINUTE` requests per minute, 120 by default, counted across the REST API and the MCP server together. The `RateLimit-Remaining` header shows how many are left. [REST API](api.md) and [MCP server](mcp.md) describe the other errors.

## Uploads fail

- **"The file is larger than 10 MB."**: the limit is `UPLOAD_MAX_BYTES`, in bytes. Raise it and run `docker compose up -d`.
- **A `413` error page from the reverse proxy**: the proxy has a smaller limit than the app. Raise it, for example with `client_max_body_size` in Nginx, see [Deployment](deployment.md).
- **"Use a PNG, JPEG, WebP or GIF image."**: Manifold checks the content of the file, not its name. Service icons may also be SVG images.
