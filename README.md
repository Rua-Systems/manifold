# Manifold

A private, single user workspace you run yourself. One SvelteKit application serves the interface and the backend, with PostgreSQL and PostGIS for storage.

Manifold, developed by [Rua Systems](https://rua.systems) and [Hasan](https://github.com/justhasanuknow). Licensed under the [Apache License 2.0](LICENSE).

## Features

- **Services:** links to the services you run, with icons, in an order you choose; they also fill the sidebar.
- **Notes:** a rich text editor (headings, lists, task lists, quotes, code, links, tables, images) with autosave, conflict handling, revision history and a trash.
- **Map Notes:** pins, lines and polygons on an OpenLayers map, each linked to a note, with the note editor next to the map.
- **Vault:** passwords and keys, encrypted with AES-256-GCM, revealed or copied only after you confirm your identity.
- **Search and command palette:** one search over notes, services and vault names; Ctrl+K or Cmd+K for pages, actions and results.
- **Security:** a single owner account, two factor authentication with TOTP and backup codes, step-up for sensitive actions, session management and an audit log.
- **REST API and MCP server:** scoped API keys for `/api/v1` (with an OpenAPI document) and for an MCP server at `/mcp`.
- **Backup and restore** through the command line, and an export download in Settings.
- English and Turkish, light and dark themes, and phones as well as desktops.

## Quick start for development

Requirements: Node.js 24 and Docker.

1. Copy `.env.example` to `.env` in the repository root and fill it in. Keep `DATABASE_URL` pointing at `localhost:5432` with the `POSTGRES_*` credentials, and fill `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY` (both from `openssl rand -base64 32`) and `OWNER_PASSWORD`.
2. Install the dependencies and start the development database (PostGIS in Docker, from `docker-compose.dev.yml`):

	```bash
	cd frontend-manifold
	npm install
	npm run db:up
	```

3. Start the app:

	```bash
	npm run dev
	```

	On its first start it applies the migrations and creates the owner account from `OWNER_USERNAME`, `OWNER_EMAIL` and `OWNER_PASSWORD`. Sign in at `http://localhost:5173/login`.

`npm run db:down` stops the database and `npm run db:reset` deletes it and starts a fresh one (it asks first).

Checks and tests. Integration and end to end tests need `npm run db:up`; they use the separate `manifold_test` database and never touch your own:

```bash
npm run check
npm run lint
npm run test:unit -- --run
npm run test:int
npm run test:e2e
```

## Deployment

`docker-compose.yml` runs two services, `db` (PostGIS 17) and `app`, with two volumes: `db-data` for the database and `uploads` for uploaded files. Neither service publishes a port.

- **Coolify:** create a Docker Compose resource from this repository and set the variables from `.env.example` in its environment settings. Coolify's proxy reaches the app on port 3000 and terminates TLS; set `ORIGIN` to the public https address.
- **Plain Docker host:** fill `.env`, copy `docker-compose.override.example.yml` to `docker-compose.override.yml` to publish the app on port 3000, and run `docker compose up -d`. Put a reverse proxy with TLS in front of it for anything but a private network.

On every start the app checks its environment, applies pending migrations, creates the owner if there is none yet, and starts its daily housekeeping (trash, audit log and unreferenced files). `GET /healthz` answers `{"status":"ok"}` while the database is reachable.

## Configuration

`.env.example` documents every variable. The essentials:

| Variable                                                                         | Required                  | Notes                                                                                                     |
| -------------------------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------- |
| `ORIGIN`                                                                         | yes                       | Public URL without a trailing slash.                                                                      |
| `DATABASE_URL`                                                                   | yes                       | Built from `POSTGRES_*` by `docker-compose.yml`; set it yourself for development or an external database. |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`                              | with the bundled database | The password must be URL safe.                                                                            |
| `BETTER_AUTH_SECRET`                                                             | yes                       | At least 32 characters. Changing it signs everyone out.                                                   |
| `ENCRYPTION_KEY`                                                                 | yes                       | 32 random bytes, base64. Encrypts the vault; see Backup below.                                            |
| `OWNER_USERNAME`, `OWNER_EMAIL`, `OWNER_PASSWORD`                                | first start               | Create the owner; ignored once it exists.                                                                 |
| `ORGANIZATION_NAME`                                                              | no                        | Display name of this instance. Default `Manifold`.                                                        |
| `SMTP_*`, `MAIL_FROM`                                                            | no                        | Mail for sign in codes, password resets and notices.                                                      |
| `MAP_TILE_URL`, `MAP_TILE_ATTRIBUTION`, `MAP_DEFAULT_CENTER`, `MAP_DEFAULT_ZOOM` | no                        | Map tiles and the starting view. Default OpenStreetMap.                                                   |
| `UPLOAD_DIR`, `UPLOAD_MAX_BYTES`                                                 | no                        | Upload storage and size limit (10 MB).                                                                    |
| `TRASH_RETENTION_DAYS`, `AUDIT_RETENTION_DAYS`, `API_RATE_LIMIT_PER_MINUTE`      | no                        | 30 days, 180 days, 120 requests per minute per key.                                                       |

**Mail.** Without `SMTP_HOST`, sign in by emailed code and password reset by mail are turned off in production, and mails are printed to the console in development. With it, set `SMTP_PORT` (587 for STARTTLS, 465 with `SMTP_SECURE=true`), `SMTP_USER`, `SMTP_PASSWORD` and `MAIL_FROM`.

## Command line

The production image ships a CLI. With Docker Compose:

```bash
docker compose exec app node cli.js migrate
docker compose exec app node cli.js owner:show
docker compose exec app node cli.js owner:reset-password
docker compose exec app node cli.js owner:disable-2fa
docker compose exec app node cli.js vault:rotate-key
docker compose exec app node cli.js backup /data/backup.tar.gz
docker compose exec app node cli.js restore /data/backup.tar.gz
```

In Coolify, run `node cli.js <command>` in the app container's terminal. In development, run `npm run build` first, then `npm run cli -- <command>`. Commands that change data are recorded in the audit log.

## Backup and restore

`node cli.js backup [path]` writes one `.tar.gz` with a `pg_dump` of the database, the uploaded files and a manifest. Settings, Data offers the same archive as a download, after you confirm your identity. To take an archive off the server:

```bash
docker compose exec app node cli.js backup /data/backup.tar.gz
docker compose cp app:/data/backup.tar.gz ./backup.tar.gz
```

`node cli.js restore <path>` restores an archive into an empty database, puts the files back and applies the migrations of newer versions. It refuses a database that already holds data unless you add `--force`, which replaces it, and it refuses archives from a newer version of Manifold. Copy the archive in with `docker compose cp ./backup.tar.gz app:/data/backup.tar.gz`, restore, then restart the app with `docker compose restart app`.

**Back up `ENCRYPTION_KEY` separately.** Archives never contain it or any other environment value. Without the key the vault of a restored backup cannot be read. To change the key, run `node cli.js vault:rotate-key` (it reads the new key from `NEW_ENCRYPTION_KEY` or asks for it), then set `ENCRYPTION_KEY` to the new key and restart.

## Recovery

- **Forgotten password:** use "Forgot password" on the sign in page when mail is set up, or run `node cli.js owner:reset-password`, which asks for a new password and signs every session out.
- **Lost authenticator and backup codes:** run `node cli.js owner:disable-2fa`. It asks for confirmation, turns two factor authentication off and signs every session out; sign in with the password and turn it on again in Settings, Security.

## API

Create a key in Settings, API Keys, choosing the scopes it needs; the key is shown once. The REST API lives under `/api/v1` and describes itself at `/api/v1/openapi.json`. Send the key as `Authorization: Bearer <key>`:

```bash
curl -H "Authorization: Bearer <key>" https://<host>/api/v1/notes
```

Lists page with `limit` and `cursor`, errors share one JSON shape, and each key has its own rate limit.

## MCP

The same keys open the MCP server at `/mcp` (streamable HTTP). Its tools follow the key's scopes: search, notes (as Markdown), revisions, services, map features and vault names. To connect Claude Code:

```bash
claude mcp add --transport http manifold https://<host>/mcp --header "Authorization: Bearer <key>"
```

Other MCP clients take the same address and header.

## Documentation

`docs/MAINTAINER.md` covers the architecture, configuration, operations, how to add a module, and the decisions taken while building Manifold. `AGENTS.md` holds the project rules for AI agents.
