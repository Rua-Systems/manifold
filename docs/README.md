# Manifold documentation

Manifold is an open-source, self-hosted workspace for one person: the services you run, notes, notes on a map and a vault for passwords and keys, behind a single owner account. It runs as one container next to PostgreSQL with PostGIS, and shares your data with scripts and AI agents through a REST API and an MCP server.

## Getting started

- [Concepts](getting-started.md) explains the owner account, the modules, search, API keys and scopes.
- [Installation](installation.md) takes you from an empty server to the first sign-in with Docker Compose.
- [Configuration](configuration.md) lists every environment variable.

## Deployment and operations

- [Deployment](deployment.md) covers the reverse proxy, Coolify, TLS, client addresses, updates and monitoring in production.
- [Operations](operations.md) describes the command line, owner recovery, key rotation, housekeeping and logs.
- [Backups and restores](backups.md) explains archives, the export download, restoring and moving to another server.
- [Email](email.md) explains the optional SMTP setup and every email Manifold sends.

## Using Manifold

- [Dashboard](dashboard.md): the page after signing in, with your notes, services, access and usage at a glance.
- [Your account](account.md): signing in, two-factor authentication, identity confirmation, sessions, preferences and the audit log.
- [Services](services.md): links to the services you run and the sidebar.
- [Notes](notes.md): the editor, saving, conflicts, revisions, the trash and images.
- [Map Notes](map-notes.md): pins, lines and polygons linked to notes.
- [Vault](vault.md): passwords and keys, revealing and copying values.
- [Search and the command palette](search.md): finding anything and moving around with the keyboard.
- [Usage report](usage.md): what Manifold keeps, the database, the disk and the server.

## Integrations

- [REST API](api.md): API keys, scopes, endpoints, paging, errors and rate limits.
- [MCP server](mcp.md): connecting AI agents and the tools they get.

## Reference

- [Security](security.md) summarizes how Manifold protects the account and the data.
- [Troubleshooting](troubleshooting.md) collects common problems and their fixes.
- [Development](development.md) is for people who want to change Manifold itself.
- [Decisions](decisions.md) records the choices made while building Manifold, with the reason for each.
