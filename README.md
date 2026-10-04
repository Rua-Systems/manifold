# Manifold

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/manifold-logo.svg">
  <img src=".github/assets/manifold-logo-dark.svg" alt="The Manifold mark" width="96">
</picture>

[![CI](https://github.com/Rua-Systems/manifold/actions/workflows/ci.yml/badge.svg)](https://github.com/Rua-Systems/manifold/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

Manifold is an open-source, self-hosted workspace for one person. It keeps the links to the services you run, your notes, notes pinned to places on a map and your passwords and keys behind a single owner account, and it lets your scripts and AI agents work with them through a REST API and an MCP server. It runs as one container next to a PostgreSQL database with PostGIS.

Manifold is developed by [Rua Systems](https://rua.systems).

## Features

### Workspace

- **Services:** links to the services you run, with icons and an order you choose; they also fill the sidebar.
- **Notes:** a rich text editor with headings, lists, task lists, quotes, code blocks, links, tables and images, automatic saving, conflict handling between tabs and devices, a revision history with restore, and a trash.
- **Map Notes:** pins, lines and polygons on an OpenLayers map, each linked to a note, with the note editor next to the map.
- **Vault:** passwords and keys encrypted with AES-256-GCM, revealed or copied only after you confirm your identity.
- **Search and command palette:** one search over notes, services and vault names, and a palette on Ctrl+K or Cmd+K for pages, actions and results.

### Integrations

- A REST API under `/api/v1` with API keys scoped per module, cursor paging, per-key rate limits and an OpenAPI 3.1 description.
- An MCP server at `/mcp` on the same keys, so AI agents such as Claude Code can search, read and write your notes, services and map features.

### Security and operations

- A single owner account without sign-up, two-factor authentication with TOTP and backup codes, identity confirmation for sensitive actions, session management and an audit log.
- One container with a read-only root filesystem and an unprivileged user, migrations on start, a health check, command-line backups and restore, an export download, and a software bill of materials in the image. Every release is published as a multi-architecture image on the GitHub Container Registry.
- English and Turkish, light and dark themes, and layouts for phones and desktops.

## Quick start

Requirements: Docker with Docker Compose.

```bash
git clone https://github.com/Rua-Systems/manifold.git
cd manifold
cp .env.example .env
```

Edit `.env`: set `BETTER_AUTH_SECRET` and `ENCRYPTION_KEY` to two different outputs of `openssl rand -base64 32`, choose a URL-safe `POSTGRES_PASSWORD`, and fill in `OWNER_USERNAME`, `OWNER_EMAIL` and `OWNER_PASSWORD`. To try Manifold on your own machine without a reverse proxy, also set `ORIGIN=http://localhost:3000` and add `ADDRESS_HEADER=` and `XFF_DEPTH=` with empty values. Then start the containers:

```bash
docker compose up -d
```

Compose pulls the prebuilt image `ghcr.io/rua-systems/manifold` for amd64 or arm64 in the version set by `MANIFOLD_VERSION`; add `--build` to build it from the source instead.

Open `http://localhost:3000/login` and sign in as the owner. For a production setup with TLS, follow [Installation](docs/installation.md) and [Deployment](docs/deployment.md).

Keep copies of `ENCRYPTION_KEY` and `BETTER_AUTH_SECRET` outside the server: backups contain neither. Without `ENCRYPTION_KEY` the vault cannot be read, and with another `BETTER_AUTH_SECRET` two-factor sign-in stops working. Manifold runs as a single instance, so never start more than one app container on the same database.

## Documentation

The documentation lives in [docs/](docs/README.md).

- **Getting started**: [Concepts](docs/getting-started.md), [Installation](docs/installation.md) and [Configuration](docs/configuration.md).
- **Deployment and operations**: [Deployment](docs/deployment.md) behind Caddy, Nginx or Coolify, [Operations](docs/operations.md) with the command line, recovery and key rotation, [Backups and restores](docs/backups.md), and [Email](docs/email.md).
- **Using Manifold**: [Your account](docs/account.md), [Services](docs/services.md), [Notes](docs/notes.md), [Map Notes](docs/map-notes.md), [Vault](docs/vault.md) and [Search and the command palette](docs/search.md).
- **Integrations**: the [REST API](docs/api.md) and the [MCP server](docs/mcp.md).
- **Reference**: [Security](docs/security.md), [Troubleshooting](docs/troubleshooting.md), [Development](docs/development.md) and the [Decisions](docs/decisions.md) behind the design.

## Built with

SvelteKit and Svelte 5, TypeScript, SCSS, a TipTap editor adapted from Edra, OpenLayers, Better Auth, Drizzle ORM with PostgreSQL 17 and PostGIS, Paraglide, the MCP TypeScript SDK, Vitest and Playwright, on Node.js 24.

## Development

Requirements: Node.js 24 with npm, and Docker for the development database.

```bash
npm ci
cp .env.example .env
npm run db:up
npm run dev
```

In `.env`, fill in the secrets and the owner as above and keep `ORIGIN=http://localhost:5173`. [Development](docs/development.md) explains the project structure, the commands, the tests, the migrations and how to add a module, and [CONTRIBUTING.md](CONTRIBUTING.md) describes how to propose changes.

## Security

Please report vulnerabilities privately as described in [SECURITY.md](SECURITY.md), not in public issues. [Security](docs/security.md) summarizes the protections.

## License

Manifold is licensed under the [Apache License 2.0](LICENSE). Derivative works must preserve the [NOTICE](NOTICE) file, which also credits the third-party code included in this repository.
