# Changelog

All notable changes to Manifold are listed here. Versions follow [Semantic Versioning](https://semver.org/); before 1.0.0, a minor version may change configuration, the API or the data in incompatible ways, and its notes say so.

## 0.5.0 - 2026-10-06

Notes can be shared through tokens, a dashboard opens after signing in, and API keys can be deleted. This release adds database migrations, which run on start; take a backup before you update. There are no configuration changes; a minor line such as `0.4` does not move to 0.5 by itself, so set `MANIFOLD_VERSION` to `0.5` or `0.5.0`.

### Added

- **Note tokens:** **Share** on a note's page creates a token for that note alone, with **Read only** or **Read and edit** access and a last day that starts a week ahead and is always required. It opens the note through a share link without signing in, or works as a key on the REST API and MCP for that note only. Creating one asks you to confirm your identity; the link and the token are shown once. See [Sharing a note](docs/notes.md#sharing-a-note).
- **Shared note page:** `/shared` shows the note alone, read only or with the editor and its autosave, but without uploads, history or trash. The token travels in the link's fragment, never in an address the server sees.
- **Dashboard:** the page after signing in. It has cards for your services as shortcuts and for your notes, with a chart of revisions per day over 30 days and the recent notes. It also covers the map's pins, lines and polygons; access, with signed in browsers, working API keys and note tokens, failed sign ins per day over seven days and the latest events; and usage. **Dashboard** in the sidebar and **Go to Dashboard** in the command palette open it.
- **Delete** for API keys and note tokens under **Settings → API Keys**, next to **Revoke**. A deleted key leaves the list for good, and its copy in the vault goes with it.
- **REST API and MCP:** note tokens reach `GET /api/v1/me`, `GET /api/v1/notes/{id}`, `PATCH /api/v1/notes/{id}` with edit access, and the `get_note` and `update_note` tools, all for their own note. `GET /api/v1/me` answers `note` for a note token.

### Changed

- Signing in, the root address and old `/dashboard/...` links lead to the dashboard instead of **Services**.
- Revisions, the audit log and its filter name **Note token** as the author of changes made with one.
- The usage report counts note tokens.
- On phones, the tools of a note's bar move to a second row when they do not fit beside the link back.

## 0.4.0 - 2026-10-06

API keys can keep a copy in the vault, and Settings has a usage report. This release adds a database migration, which runs on start; take a backup before you update. There are no configuration changes; a minor line such as `0.3` does not move to 0.4 by itself, so set `MANIFOLD_VERSION` to `0.4` or `0.4.0`.

### Added

- **API key copies in the vault:** **Save a copy in the Vault** under **Settings → API Keys** saves a new key in the vault as well, in the same step and encrypted like every entry, so it can be revealed or copied again later after you confirm your identity. The copy is named **API key:** with the key's name, and its card says it is a copy. Revoking the key deletes its copy; an expired key keeps it. The box is off by default.
- **Usage report:** **Settings → Usage** shows how many notes, notes in the trash, revisions, map features, basemaps, services, vault entries, audit log events, API keys and sessions there are and the space they take, the uploaded files by module, the database and its tables, the free space of the disk that holds the uploads, and the memory and processor time of the server. **Measure Again** measures once more, and **Go to Usage** in the command palette opens it.
- **REST API and MCP:** `GET /api/v1/usage` and the `get_usage` tool answer the same report with the new `usage:read` scope, labelled **Read the usage report**. Vault entries gain `api_key_id`, set on the copy of an API key.

### Security

- `source-map-js` is updated to 1.2.2, which fixes GHSA-68fv-2mgg-jv7q, a denial of service of high severity through indexed source maps. Only build and lint tools use it.

## 0.3.0 - 2026-10-04

The map gets basemaps. This release adds a database migration, which runs on start; take a backup before you update. There are no configuration changes; a minor line such as `0.2` does not move to 0.3 by itself, so set `MANIFOLD_VERSION` to `0.3` or `0.3.0`.

### Added

- **Basemaps:** tile sources for the map, added under **Settings → Map** with a name, an `https` XYZ tile address, an attribution and a maximum zoom, and ordered, edited and deleted there. The one in use shows on the map page and on the small map of every note page; **Use** on the settings page or **Basemap** in the map tools switches it, and the choice is the same in every browser. The tiles of `MAP_TILE_URL` remain as **Standard**, shown while no other basemap is in use.
- **Go to Map** in the command palette.
- **REST API:** `/api/v1/map/basemaps` lists, adds, changes, puts in use and deletes basemaps with the `map:read` and `map:write` scopes.

### Changed

- The map zooms as deep as the basemap in use allows instead of always to level 19.

## 0.2.0 - 2026-10-04

Notes separate reading from writing, gain a focus mode for writing and save with `Ctrl+S`. There are no database or configuration changes; a minor line such as `0.1` does not move to 0.2 by itself, so set `MANIFOLD_VERSION` to `0.2` or `0.2.0`.

### Added

- **Reading mode:** a saved note opens for reading, with its title as a heading, the text without the toolbar and links that open with a click. **Edit** switches to writing and back, and going back saves what is still pending. A new note, and a note without a title or text such as one just created on the map, opens for writing.
- **Focus mode:** while you write, **Focus mode** shows the note alone over the whole screen with the rest of the app blurred behind it. The button again, or `Escape`, leaves it. The note panel of the map has no focus mode.
- **`Ctrl+S`**, or `Cmd+S` on a Mac, saves the note at once instead of after the pause, and the browser no longer offers to save the page.

### Changed

- The note editor tells screen readers when it is read-only.

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
