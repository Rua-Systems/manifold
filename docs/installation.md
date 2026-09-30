# Installation

This guide installs Manifold with Docker Compose, the recommended way to run it. At the end you have a running installation with its database and the owner account. [Deployment](deployment.md) then explains how to publish it on your domain with TLS.

## Requirements

- A server or computer with Docker Engine and the Docker Compose plugin. Any system that runs Linux containers works, including Docker Desktop on Windows and macOS.
- Disk space for the database, your uploaded files and your backups. Backup archives are written to the same volume as the uploaded files, see [Backups and restores](backups.md).
- For production: a domain name and a reverse proxy that terminates TLS, such as Caddy, Nginx or Coolify.
- Optional: an SMTP server, for sign-in codes, password reset codes and notices by email, see [Email](email.md).

## 1. Get the Compose file

Manifold is published as a prebuilt image for amd64 and arm64 servers at `ghcr.io/justhasanuknow/manifold`. The repository provides the `docker-compose.yml` that runs it next to a PostgreSQL database with PostGIS, and the `.env.example` template. Clone the repository and change into it:

```bash
git clone https://github.com/justhasanuknow/manifold.git
cd manifold
```

For production, check out the latest release instead of the development state of `main`. The [releases page](https://github.com/justhasanuknow/manifold/releases) lists the versions, for example:

```bash
git checkout v0.1.0
```

## 2. Create the configuration

Copy the commented template:

```bash
cp .env.example .env
```

Open `.env` and set at least these values:

| Variable             | What to enter                                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| `MANIFOLD_VERSION`   | The release you checked out, for example `0.1.0`.                                                    |
| `ORIGIN`             | The public address, for example `https://manifold.example.com`, without a path or a trailing slash.  |
| `POSTGRES_PASSWORD`  | A new password for the bundled database. Generate it with the second command below.                  |
| `BETTER_AUTH_SECRET` | At least 32 random characters. Generate them with the first command below.                           |
| `ENCRYPTION_KEY`     | Exactly 32 random bytes, base64 encoded. Generate a second value with the first command below.       |
| `OWNER_USERNAME`     | The username of the owner account: 3 to 32 lowercase letters, digits, `.`, `_` or `-`.               |
| `OWNER_EMAIL`        | The email address of the owner account.                                                              |
| `OWNER_PASSWORD`     | The password of the owner account, 8 to 128 characters. You sign in with it and can change it later. |

Generate `BETTER_AUTH_SECRET` and `ENCRYPTION_KEY` with this command, once for each:

```bash
openssl rand -base64 32
```

Generate the database password with this command:

```bash
openssl rand -hex 32
```

The database password becomes part of a connection string, so it may contain only letters, digits, `-`, `_`, `.` and `~`; hex output always fits. Keep `POSTGRES_USER` and `POSTGRES_DB` as they are. The `DATABASE_URL` line in `.env` is only for development: `docker-compose.yml` builds the connection string from the `POSTGRES_*` variables.

Store copies of `BETTER_AUTH_SECRET` and `ENCRYPTION_KEY` outside the server, for example in a password manager. Backups never contain them, and without `ENCRYPTION_KEY` the vault of a restored backup cannot be read.

A minimal `.env` for a production server looks like this:

```dotenv
MANIFOLD_VERSION=0.1.0
ORIGIN=https://manifold.example.com
ORGANIZATION_NAME=Manifold
POSTGRES_USER=manifold
POSTGRES_PASSWORD=replace-with-the-output-of-openssl-rand-hex-32
POSTGRES_DB=manifold
BETTER_AUTH_SECRET=replace-with-the-output-of-openssl-rand-base64-32
ENCRYPTION_KEY=replace-with-another-output-of-openssl-rand-base64-32
OWNER_USERNAME=owner
OWNER_EMAIL=owner@example.com
OWNER_PASSWORD=choose-a-long-passphrase
```

You do not need to set `ADDRESS_HEADER` and `XFF_DEPTH` for a single reverse proxy: when they are not set, `docker-compose.yml` makes the app read the client address from the `X-Forwarded-For` header of that proxy, as [Deployment](deployment.md#client-addresses) explains.

To try Manifold on your own computer without a reverse proxy, use these values instead:

```dotenv
ORIGIN=http://localhost:3000
ADDRESS_HEADER=
XFF_DEPTH=
```

The two empty values matter: without them, the app expects every request to arrive through a proxy that sets `X-Forwarded-For`, and signing in fails when you open it directly. Open it at exactly `http://localhost:3000`, not at `http://127.0.0.1:3000`, because the app refuses form submissions from any origin other than `ORIGIN`.

Every variable is described in [Configuration](configuration.md). Email is optional and can be added later, see [Email](email.md).

## 3. Start

```bash
docker compose up -d
```

Compose pulls the image in the version set by `MANIFOLD_VERSION` in `.env`: `latest`, a release such as `0.1.0`, or a minor line such as `0.1` for the newest 0.1.x release. To build the image from the checkout instead, for example after changing the code, add `--build`. Compose refuses to start while `ORIGIN`, a `POSTGRES_*` variable, `BETTER_AUTH_SECRET` or `ENCRYPTION_KEY` is empty, and names the variable.

Every published image carries a signed attestation of the workflow and commit it was built from. With the GitHub CLI you can check it before you run it:

```bash
gh attestation verify oci://ghcr.io/justhasanuknow/manifold:0.1.0 --owner justhasanuknow
```

The image also contains a CycloneDX software bill of materials at `/app/sbom.cdx.json`.

The first start creates the database in the `db-data` volume. The app waits until the database reports healthy, validates its environment, applies all migrations, creates the owner account from the `OWNER_*` variables and starts listening on port 3000. It also starts the daily housekeeping, which deletes notes that have stayed in the trash too long, old audit events and uploaded files that nothing refers to any more. Later starts apply pending migrations automatically before the app accepts requests.

The Compose file publishes the port only on `127.0.0.1`, so the app is reachable from the server itself and from a reverse proxy on it, but not directly from the internet. The database is not published at all.

## 4. Check that it runs

The app container reports its health through `GET /healthz`:

```bash
docker compose ps
```

```bash
curl http://127.0.0.1:3000/healthz
```

A healthy installation answers `{"status":"ok"}`. If the `app` container keeps restarting, read its log:

```bash
docker compose logs app
```

The most common reason is an invalid environment: the app names every variable that is missing or invalid and the rule it breaks, never its value, and refuses to start until you fix them. On the first start, a missing or invalid `OWNER_*` variable stops it the same way. [Troubleshooting](troubleshooting.md) explains the messages.

## 5. Sign in

Open `/login` on your `ORIGIN`, for example `https://manifold.example.com/login`, and sign in with `OWNER_USERNAME` or `OWNER_EMAIL` and `OWNER_PASSWORD`. Manifold has exactly one account, the owner, and no sign-up. After signing in you land on **Services**.

Once the owner exists, the `OWNER_*` variables are ignored, and the log reminds you that they can be removed. Remove at least `OWNER_PASSWORD` from `.env`. If you forget the username later, `docker compose exec app node cli.js owner:show` prints it; [Operations](operations.md) describes the other recovery commands.

Good first steps:

1. Turn on two-factor authentication under **Settings → Security**, see [Your account](account.md).
2. Set up [email](email.md), so that you can sign in with an emailed code and reset a forgotten password.
3. Take a first backup and copy it off the server, see [Backups and restores](backups.md).
4. Create API keys under **Settings → API Keys** if scripts or AI agents should reach your data, see [REST API](api.md) and [MCP server](mcp.md).

## Managing the containers

Stop and start Manifold without losing data:

```bash
docker compose stop
```

```bash
docker compose start
```

`docker compose down` removes the containers but keeps the two volumes: `db-data` with the database, and `app-data`, mounted at `/data`, with the uploaded files in `uploads/`, the backup archives in `backups/` and the temporary work files of backups in `tmp/`. Never add `--volumes` unless you really want to delete all data. Take a [backup](backups.md) before any change you are unsure about.

## Next steps

- [Deployment](deployment.md) puts Manifold behind a reverse proxy or on Coolify, and covers TLS, updates and monitoring.
- [Configuration](configuration.md) lists every environment variable.
- [Email](email.md) sets up SMTP for sign-in codes, password resets and notices.
- [Backups and restores](backups.md) explains archives, restoring and moving to another server.

To work on the code with hot reloading instead, see [Development](development.md).
