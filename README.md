# Manifold

A private, single user workspace. One SvelteKit application serves the interface and the backend, with PostgreSQL (PostGIS) for storage.

Manifold, developed by [Rua Systems](https://rua.systems) and [Hasan](https://github.com/justhasanuknow). Licensed under the [Apache License 2.0](LICENSE).

This README grows with Batch 01; the complete version arrives at the end of the batch.

## Development

Requirements: Node.js 24, Docker.

1. Copy `.env.example` to `.env` and fill it in. For development, keep `DATABASE_URL` pointing at `localhost:5432` with the `POSTGRES_*` credentials.
2. Install and start the database:

	```bash
	cd frontend-manifold
	npm install
	npm run db:up
	```

3. Start the app with `npm run dev`. On its first start it applies the migrations and creates the owner account from `OWNER_USERNAME`, `OWNER_EMAIL` and `OWNER_PASSWORD`.

`npm run db:down` stops the database, `npm run db:reset` deletes it and starts a fresh one (it asks for confirmation).

Checks and tests (the integration and end to end tests need `npm run db:up`; they use the separate `manifold_test` database):

```bash
npm run check
npm run lint
npm run test:unit -- --run
npm run test:int
npm run test:e2e
```

## Deployment

`docker-compose.yml` runs two services: `db` (PostGIS 17) and `app`. Neither publishes a port.

- **Coolify:** create a Docker Compose resource from this repository and set the variables from `.env.example` in its environment settings. Coolify's proxy reaches the app on port 3000.
- **Plain Docker host:** copy `docker-compose.override.example.yml` to `docker-compose.override.yml` to publish the app on port 3000, fill `.env`, and run `docker compose up -d`.

The app applies pending migrations and creates the owner on start. `GET /healthz` answers `{"status":"ok"}` while the database is reachable.

## Command line

The production image ships a CLI:

```bash
docker compose exec app node cli.js migrate
docker compose exec app node cli.js owner:show
docker compose exec app node cli.js owner:reset-password
docker compose exec app node cli.js owner:disable-2fa
```

In Coolify, run the same `node cli.js <command>` in the app container's terminal. `owner:reset-password` asks for the new password twice and signs every session out. `owner:disable-2fa` is for an owner who lost their authenticator and backup codes: it asks for confirmation, turns two factor authentication off and signs every session out. Commands that change data are recorded in the audit log.

In development, `npm run build` first, then `npm run cli -- <command>`.
