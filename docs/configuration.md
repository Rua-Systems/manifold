# Configuration

Manifold is configured entirely through environment variables. With Docker Compose they come from the `.env` file next to `docker-compose.yml`; `.env.example` is a commented template. Compose passes to the app only the variables that `docker-compose.yml` lists, and it builds some of them itself, as noted below. The same file also sets `MANIFOLD_VERSION`, which only Compose reads to choose the version of the image, see [Image version](#image-version).

The environment is validated on every start. When a required variable is missing or a value is invalid, the app logs `Invalid environment configuration:` with one line for each problem, naming the variable and the rule it breaks, and refuses to start. Values are never printed in these messages. An empty value counts as not set, so an empty optional variable takes its default. The commands of the command line validate the environment the same way.

Compose checks a few variables before the app even starts: `docker-compose.yml` writes `ORIGIN`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `BETTER_AUTH_SECRET` and `ENCRYPTION_KEY` as `${VARIABLE:?}`, so Compose refuses to start while one of them is empty and names it.

## Instance and address

### ORIGIN

Required. The public address of the installation, with scheme and host and an optional port, but without a path or a trailing slash:

```dotenv
ORIGIN=https://manifold.example.com
```

Manifold uses it to refuse form submissions from other sites, as the base address of sign-in and sessions, and as the server address in the OpenAPI description of the REST API. With an `https` origin, session cookies are marked `Secure` and the app sends `Strict-Transport-Security`. Open Manifold exactly at this address: under a different host name, such as `127.0.0.1` instead of `localhost`, form submissions are refused and signing in fails.

### ORGANIZATION_NAME

Optional, `Manifold` when empty, at most 80 characters. The display name of this instance: it appears in page titles, in the sidebar header, on the sign-in screens, in emails, as the issuer name in authenticator apps and in the title of the API description. When `MAIL_FROM` has no display name, it becomes the sender's name.

## Database

| Variable            | Purpose                                                                                                                                        |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `POSTGRES_USER`     | User of the bundled database, `manifold` in `.env.example`.                                                                                    |
| `POSTGRES_PASSWORD` | Password of that user. Replace `change-me` from `.env.example` before the first start; the app refuses it when `ORIGIN` is an `https` address. |
| `POSTGRES_DB`       | Name of the database, `manifold` in `.env.example`.                                                                                            |
| `DATABASE_URL`      | Connection string of the app, starting with `postgres://` or `postgresql://`.                                                                  |

The three `POSTGRES_*` variables are required by `docker-compose.yml`, which passes them to the `db` service and builds `DATABASE_URL` from them for the `app` service:

```text
postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}
```

Because the password becomes part of this connection string, it may contain only letters, digits, `-`, `_`, `.` and `~`. `openssl rand -hex 32` generates a suitable one. The `DATABASE_URL` line in `.env.example` points to `localhost:5432` for development and for running the command line outside a container; Compose does not pass it on.

The database image applies the `POSTGRES_*` values only when it creates the `db-data` volume on the first start. Changing them in `.env` later does not change the existing database, and the app can no longer connect; change the password inside PostgreSQL first.

To use a database of your own instead of the bundled one, adapt the Compose file: set `DATABASE_URL` for the `app` service and remove the `db` service and the `depends_on` that waits for it. The database must be PostgreSQL 17 with PostGIS, the version the image's backup tools are made for, and must allow creating the `postgis` and `pg_trgm` extensions. When the database is reached over a network you do not control, require TLS with a checked certificate: add `?sslmode=verify-full` to `DATABASE_URL` (postgres.js then verifies the server's certificate and name); `sslmode=require` encrypts without checking who answers.

## Secrets

### BETTER_AUTH_SECRET

Required. A random value of at least 32 characters:

```bash
openssl rand -base64 32
```

It signs sessions and tokens, and encrypts the stored two-factor secret and backup codes. Changing it signs everyone out, and the codes of your authenticator app and your backup codes stop working: turn two-factor authentication off with `node cli.js owner:disable-2fa` and set it up again, see [Operations](operations.md). Backups do not contain this secret, so keep a copy outside the server.

### ENCRYPTION_KEY

Required. Exactly 32 random bytes, base64 encoded:

```bash
openssl rand -base64 32
```

A hex value such as the output of `openssl rand -hex 32` is refused. The key encrypts the values in the [vault](vault.md) with AES-256-GCM. Backups never contain it, and nothing can recover the vault without it, so keep a copy outside the server and separately from your backups.

Never change it by simply replacing the value: the vault would become unreadable. `node cli.js vault:rotate-key` encrypts every value again with a new key, which it reads from `NEW_ENCRYPTION_KEY` or asks for; then you set `ENCRYPTION_KEY` to the new key and restart the app. [Operations](operations.md) describes the steps.

### Secrets from files

Instead of a value in the environment, `DATABASE_URL`, `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY`, `OWNER_PASSWORD` and `SMTP_PASSWORD` can come from a file, such as a Docker secret: set `DATABASE_URL_FILE`, `BETTER_AUTH_SECRET_FILE` and so on to the path of the file. The app reads the file on start and drops one trailing line break. Set either the variable or its `_FILE` form, not both; a file that cannot be read stops the start with the variable's name. The variables must reach the `app` service, so add them to its `environment` in the Compose file together with the secret's mount.

## Owner account

These variables are read only while the database has no user, to create the owner account on the first start.

| Variable         | Rule                                                                                                                                |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `OWNER_USERNAME` | 3 to 32 lowercase letters, digits, `.`, `_` or `-`.                                                                                 |
| `OWNER_EMAIL`    | A valid email address.                                                                                                              |
| `OWNER_PASSWORD` | 8 to 128 characters, not a common password, and without the product name, the organization name, the username or the email address. |

If one of them is missing or breaks its rule on the first start, the app names it and refuses to start. Once the owner exists, the variables are ignored: they are never compared with the account or used to change it, and the log reminds you that they can be removed. Change the username, the email address and the password under **Settings → Profile** instead, see [Your account](account.md).

## Email

Email turns on when `SMTP_HOST` is set. Without it, signing in with an emailed code, resetting the password by email and the emailed security notices are off.

| Variable        | Default | Purpose                                                                              |
| --------------- | ------- | ------------------------------------------------------------------------------------ |
| `SMTP_HOST`     |         | Host name of the SMTP server.                                                        |
| `SMTP_PORT`     | `587`   | `587` for STARTTLS, `465` for implicit TLS.                                          |
| `SMTP_SECURE`   | `false` | `true` only for implicit TLS on port 465.                                            |
| `SMTP_USER`     |         | User for SMTP authentication. Without it, Manifold sends without authenticating.     |
| `SMTP_PASSWORD` |         | Password of `SMTP_USER`.                                                             |
| `MAIL_FROM`     |         | Sender address, such as `no-reply@example.com` or `Manifold <no-reply@example.com>`. |

Set `MAIL_FROM` whenever you set `SMTP_HOST`. Without a display name in it, `ORGANIZATION_NAME` is used as the sender's name. See [Email](email.md) for providers and the emails Manifold sends.

## Map

These variables configure [Map Notes](map-notes.md).

| Variable               | Default                        | Purpose                                                                        |
| ---------------------- | ------------------------------ | ------------------------------------------------------------------------------ |
| `MAP_TILE_URL`         | OpenStreetMap's standard tiles | XYZ template of the **Standard** basemap, with `{z}`, `{x}` and `{y}`.         |
| `MAP_TILE_ATTRIBUTION` | the OpenStreetMap attribution  | Attribution of the **Standard** basemap, as HTML.                              |
| `MAP_DEFAULT_CENTER`   | `0,20`                         | Center of the map as `lon,lat` in degrees, when the browser has no saved view. |
| `MAP_DEFAULT_ZOOM`     | `2`                            | Zoom level from 0 to 22, when the browser has no saved view.                   |

The default template is `https://tile.openstreetmap.org/{z}/{x}/{y}.png`. Browsers load the tiles directly from the tile server, and the content security policy allows images from any `https` address, so a tile server must be reachable over `https`. Change `MAP_TILE_ATTRIBUTION` together with `MAP_TILE_URL`, so that the map credits the right source. More basemaps are added in the app under **Settings → Map**, not through variables; see [Map Notes](map-notes.md#basemaps).

## Uploads and retention

| Variable               | Default            | Purpose                                                    |
| ---------------------- | ------------------ | ---------------------------------------------------------- |
| `UPLOAD_DIR`           | `/data/uploads`    | Folder of the uploaded files. Set by the image; keep it.   |
| `UPLOAD_MAX_BYTES`     | `10485760` (10 MB) | Largest accepted upload, in bytes.                         |
| `TRASH_RETENTION_DAYS` | `30`               | Days a trashed note is kept before it is deleted for good. |
| `AUDIT_RETENTION_DAYS` | `180`              | Days audit events are kept.                                |

`docker-compose.yml` does not pass `UPLOAD_DIR` on; the image sets it to the `uploads` folder of the `/data` volume. Backups written by the command line without a path go to the `backups` folder next to it, `/data/backups`.

The app limits request bodies itself: an upload may be as large as `UPLOAD_MAX_BYTES` plus 256 KB for the other form fields, and every other request body is limited to 5 MB. A reverse proxy in front of it must accept at least as much, see [Deployment](deployment.md#reverse-proxy).

The housekeeping that applies the retention periods runs inside the app, once on every start and then once a day. It also deletes uploaded files that are older than a day and that nothing refers to any more.

## API

`API_RATE_LIMIT_PER_MINUTE` sets how many requests each API key may make per minute, the REST API and the MCP server together. The default is `120`. Further requests are answered with status `429` until the minute is over. See [REST API](api.md) and [MCP server](mcp.md).

## Reverse proxy

| Variable         | Default in `docker-compose.yml` | Purpose                                                                              |
| ---------------- | ------------------------------- | ------------------------------------------------------------------------------------ |
| `ADDRESS_HEADER` | `x-forwarded-for`               | Header that carries the client address.                                              |
| `XFF_DEPTH`      | `1`                             | Number of trusted proxies in front of the app, when the header is `x-forwarded-for`. |

`docker-compose.yml` uses these defaults when the variables are not set at all, which fits one reverse proxy on the same server. `.env.example` keeps both lines commented out for that reason. Setting both to nothing makes the app use the address of the connection instead, which is what you need to reach the container without a proxy:

```dotenv
ADDRESS_HEADER=
XFF_DEPTH=
```

The Node server reads these two variables itself; they are not part of the validation at start. When `ADDRESS_HEADER` is set but a request arrives without that header, or with fewer addresses in it than `XFF_DEPTH`, the app cannot tell the client address, and requests that need it, such as signing in, fail. [Deployment](deployment.md#client-addresses) explains the right values for your setup.

## Set by the image

The image sets these variables, and `UPLOAD_DIR` as described above. `docker-compose.yml` does not pass them from `.env`; leave them as they are.

| Variable          | Value        | Purpose                                                                                      |
| ----------------- | ------------ | -------------------------------------------------------------------------------------------- |
| `NODE_ENV`        | `production` | Runs the app in production mode.                                                             |
| `HOST`            | `0.0.0.0`    | Address the server listens on inside the container.                                          |
| `PORT`            | `3000`       | Port the server listens on inside the container. The health check follows it.                |
| `BODY_SIZE_LIMIT` | `Infinity`   | Lifts the Node server's own body limit, because the app applies its own limits.              |
| `TMPDIR`          | `/data/tmp`  | Work files of backups, on the volume, so that large archives do not have to fit into memory. |

## Image version

`MANIFOLD_VERSION` is read only by Compose. It chooses the tag of `ghcr.io/rua-systems/manifold` that `docker-compose.yml` runs:

- `latest`, the default, is the newest release.
- A release such as `0.4.0` stays on exactly that version.
- A minor line such as `0.4` follows the newest patch release of 0.4.

In production, set a release or a minor line, so that a new minor version arrives only when you choose it, see [Updating](deployment.md#updating). `docker compose up --build` builds the image from your checkout instead of pulling it.

## Validation rules at a glance

- `ORIGIN` must be an `http` or `https` URL without a trailing slash.
- `DATABASE_URL` must start with `postgres://` or `postgresql://`.
- `BETTER_AUTH_SECRET` must have at least 32 characters.
- `ENCRYPTION_KEY` must decode from base64 to exactly 32 bytes.
- When `ORIGIN` is an `https` address, the database password must not be `change-me`, the example from `.env.example`.
- A variable and its `_FILE` form may not both be set, and the file must be readable.
- `ORGANIZATION_NAME` may have at most 80 characters.
- `SMTP_PORT` must be a whole number from 1 to 65535.
- `UPLOAD_MAX_BYTES`, `TRASH_RETENTION_DAYS`, `AUDIT_RETENTION_DAYS` and `API_RATE_LIMIT_PER_MINUTE` must be whole numbers of at least 1.
- `SMTP_SECURE` accepts only `true` or `false`.
- `MAP_DEFAULT_CENTER` must be two numbers, `lon,lat`, with the longitude from -180 to 180 and the latitude from -90 to 90.
- `MAP_DEFAULT_ZOOM` must be a number from 0 to 22.
- On the first start only, `OWNER_USERNAME`, `OWNER_EMAIL` and `OWNER_PASSWORD` must follow the rules in [Owner account](#owner-account).
