# Changelog

All notable changes to Manifold are listed here. Versions follow [Semantic Versioning](https://semver.org/); before 1.0.0, a minor version may change configuration, the API or the data in incompatible ways, and its notes say so.

## 0.1.1 - 2026-10-04

The project moved to the Rua Systems organization, and this release fixes the editor toolbar, typing mistakes in the search and advisories in a package that SvelteKit runs.

### Changed

- The repository is at [github.com/Rua-Systems/manifold](https://github.com/Rua-Systems/manifold) and the image at `ghcr.io/rua-systems/manifold`. The former image address `ghcr.io/justhasanuknow/manifold` no longer exists: when you update from 0.1.0, check out `v0.1.1`, or change the `image` line of a Compose file pasted into Coolify, see [Updating](docs/deployment.md#updating).
- The credit in the app, the mails, the README and `NOTICE` names Rua Systems alone.
- Svelte, Vite and the other build tools are updated.

### Fixed

- The editor toolbar no longer wraps onto a second row and pushes the text down. It is one row everywhere and scrolls sideways where it does not fit, such as in the note panel of the map; with a mouse its buttons are smaller, so the whole row fits on the note page.
- The search, the note filters and the MCP tools forgive a typing mistake in one word of a long title, alias, address or vault entry name: `gardn` now finds "Weekly planning for the garden project".

### Security

- `devalue`, which SvelteKit uses to serialize the data of pages, is updated to 5.9.4. It fixes three advisories of high severity (GHSA-j22f-vq7h-c4qm, GHSA-mcm9-63f2-9j32, GHSA-x5rw-q4pp-hg5g) and three of moderate severity.
- Continuous integration audits the dependencies through `scripts/audit.ts`, which accepts only advisories without a fixed release that reach the project through build tools alone. The one accepted now is GHSA-vfj7-8cjw-p6xm in `braces`, used only by the Markdown linter.

## 0.1.0 - 2026-09-30

The first release.

### Added

- **Services:** links to the services you run, with icons and an order you choose, shown in the sidebar.
- **Notes:** a rich text editor with headings, lists, task lists, quotes, code blocks, links, tables and images, automatic saving, conflict handling between tabs and devices, a revision history with restore, and a trash that empties itself after 30 days.
- **Map Notes:** pins, lines and polygons on an OpenLayers map, each linked to a note, with the note editor next to the map and configurable tiles.
- **Vault:** passwords and keys encrypted with AES-256-GCM, revealed or copied only after you confirm your identity.
- **Search and command palette:** one search over notes, services and vault names, and a palette on Ctrl+K or Cmd+K for pages, actions and results.
- **Account security:** a single owner account, two-factor authentication with TOTP and backup codes, sign-in codes by email, identity confirmation for sensitive actions, session management and an audit log.
- **REST API** under `/api/v1` with scoped API keys, cursor paging, per-key rate limits and an OpenAPI 3.1 description.
- **MCP server** at `/mcp` on the same keys and scopes, with tools for search, notes, services, map features and vault names.
- **Backups:** `backup` and `restore` on the command line and an export download in **Settings → Data**; archives never contain `ENCRYPTION_KEY` or `BETTER_AUTH_SECRET`.
- English and Turkish, light and dark themes, and layouts for phones and desktops.
- A container image for amd64 and arm64 on the GitHub Container Registry, with a read-only root filesystem, an unprivileged user, a health check and a software bill of materials. Releases can deploy themselves to Coolify through its deploy webhook.

### Security

Manifold was reviewed against OWASP ASVS 5.0 levels 1 and 2 before this release; [docs/SECURITY-REVIEW.md](docs/SECURITY-REVIEW.md) lists every requirement. The review brought:

- Security headers on every response, static files included, through the app's own server entry, `Cache-Control: no-store` for pages and data, and `Clear-Site-Data` when signing out.
- A limit of five wrong passwords or codes per minute per account in signed-in sessions, single-use authenticator codes, backup codes of 120 bits, emailed codes stored as hashes, and a confirmation of your identity before ending sessions.
- Sessions that end 30 days after their sign in at the latest.
- New passwords are checked against common passwords and the names of the product, the organization and the account, and hashed with stronger scrypt parameters; older hashes are upgraded at the next sign in.
- Redirects after sign in stay on the site even for crafted addresses.
- SMTP requires TLS, the audit log is append-only in the database, and the application log is structured JSON with security events and error ids.
- Secrets can come from files, and the example database password is refused on a public address.
- Limits for editor uploads and exports, bounds for every input, checks for SVG icons, and a restore that accepts only the files of a Manifold backup.
