# Changelog

All notable changes to Manifold are listed here. Versions follow [Semantic Versioning](https://semver.org/); before 1.0.0, a minor version may change configuration, the API or the data in incompatible ways, and its notes say so.

## 0.8.1 - 2026-10-16

Two interface fixes: the scope labels of the API key form stay inside their cards, and the editor toolbar wraps instead of scrolling for mouse users. There are no database or configuration changes; a minor line such as `0.8` picks this release up by itself.

### Fixed

- **API key form:** in **Settings → API Keys**, each scope's label and id stack and wrap, so the long labels of data sources, longest in Turkish, no longer run past their card or squeeze into a narrow column.
- **Editor toolbar:** with a mouse, the toolbar fits the note page in one row again, with its groups closer together. Where it does not fit, as beside a wide sidebar or in the note panel of the map, its last groups move to a second row instead of scrolling sideways. Touch screens keep the scrolling row. See [Notes](docs/notes.md#the-editor).

## 0.8.0 - 2026-10-15

A new **AI Memory** module keeps what you and your AI agents share: memories in categories, with global tags, pins and a history that names every writer, and saved prompts that MCP clients offer as commands. Global **tags** arrive in **Settings → Tags**. This release adds three database migrations, which run on start; take a backup before you update. A minor line such as `0.7` does not move to 0.8 by itself, so set `MANIFOLD_VERSION` to `0.8` or `0.8.0`.

### Added

- **Tags:** **Settings → Tags** keeps global tags, each with a name, unique whatever its case, and one of eight colors that work in both themes. Only you make, rename and delete them; agents choose from them by name. Deleting a tag takes it off everything that carried it.
- **AI Memory:** **AI Memory** in the sidebar keeps memories, a title and text written in the note editor, for you and your agents. See [AI Memory](docs/ai-memory.md).
  - Memories sit in categories with subcategories, two levels, carry tags and can be pinned. Pinned memories are what agents read first.
  - Every new title or text is a version that names its writer, you or the API key by name; **History** shows and restores them. Changing the category, tags or pin is not a version. A memory changed elsewhere while you edit offers **Reload** or **Keep Mine**.
  - The trash keeps memories for `TRASH_RETENTION_DAYS`. Agents can trash and restore; only you delete for good.
  - The AI Memory page filters by words, category, tag and pin, and **Categories** manages the categories; only empty ones are deleted.
- **Prompts:** **Prompts** in AI Memory keeps instructions you use again, with `{{name}}` for each place that changes, a handle such as `code-review`, a category and tags. **Try it** fills the places and copies the result. See [AI Memory](docs/ai-memory.md#prompts).
- **Keys limited to categories:** an API key with a memory or prompt scope can be limited to some categories when it is created. It then reaches only the memories and prompts in them and their subcategories, everywhere, including the search, and files everything it writes in them.
- **MCP:**
  - the server offers your prompts as MCP prompts, under their handles and with their places as arguments; Claude Code shows them as commands;
  - memory tools `get_memory_context`, `search_memories`, `get_memory`, `remember`, `update_memory`, `trash_memory`, `restore_memory`, `list_memory_categories` and `list_memory_revisions`;
  - prompt tools `list_prompts`, `get_prompt`, `save_prompt` and `update_prompt`;
  - `list_tags`, for any key.
- **REST API:**
  - `/api/v1/memories`, with revisions, trash and restore;
  - `/api/v1/memory-categories` and `/api/v1/memory/context`;
  - `/api/v1/prompts`, with `/render`;
  - `GET /api/v1/tags`.

  Memories go in and out as Markdown, and tags by name.

- **Scopes:** `memory:read`, `memory:write`, `prompts:read` and `prompts:write`.
- The search and the command palette find memories and prompts, the dashboard has an **AI Memory** card, and the usage report counts memories, categories, the memory trash, revisions and prompts.

### Changed

- The MCP `search` tool accepts `memory` and `prompt` as types, and the search hands each module the key that searches, so a key limited to some categories finds only their memories and prompts.
- Modules may give the search more than one provider, and offer MCP prompts through their manifest.

## 0.7.0 - 2026-10-15

Notes go into folders, the sidebar can be dragged wider, and a new **Data Sources** module keeps where your databases, APIs, buckets and links are, with their secrets encrypted, SSH tunnels and connection tests. This release adds three database migrations, which run on start; take a backup before you update. A minor line such as `0.6` does not move to 0.7 by itself, so set `MANIFOLD_VERSION` to `0.7` or `0.7.0`.

### Added

- **Note folders:** notes sit in nested folders of your own. **New Folder** on the Notes page, folders that open their own page with the path back, **New Note** inside a folder, **Move to Folder** in a note's bar, and dragging notes and folders onto folders on a computer. Folders are renamed, moved and deleted once empty; notes in the trash do not count and move to the top. Moving a note keeps its version. The sidebar shows the notes as a tree: folders by name, each with its newest notes, and the folder of the open note opens by itself. See [Notes](docs/notes.md#folders).
- **Sidebar width:** drag the right edge of the expanded sidebar to make it 200 to 500 pixels wide, or move it with the arrow keys, **Home** and **End**; a double click resets it. The width is stored with your account, so every browser opens the sidebar as wide.
- **Data Sources:** **Data Sources** in the sidebar keeps PostgreSQL, MySQL and MariaDB, Redis, S3 compatible storage, HTTP APIs and links, each with its settings, notes, a documentation link and its secrets, encrypted like vault values. See [Data Sources](docs/data-sources.md).
  - **Test Connection** has the server connect, read something harmless such as the server version, and close; the outcome stays with the source.
  - Databases and Redis can be reached through an SSH tunnel, with a password or a private key. The first test that gets through trusts the SSH server's host key, and later tests refuse another one.
  - Secrets show for 30 seconds, or go to the clipboard, after you confirm your identity, and each reveal is recorded in the audit log. Changing a secret asks for the same confirmation.
- **REST API:**
  - `/api/v1/note-folders` lists, creates, renames, moves and deletes folders of notes;
  - notes carry `folder_id`, which also filters `GET /api/v1/notes` (`root` for the top level), places a new note and moves one with `PATCH`;
  - `/api/v1/data-sources` adds, lists, reads, changes, deletes and tests sources;
  - `/api/v1/data-sources/{id}/secrets` reads a source's secrets.
- **MCP:**
  - `move_note`, `list_note_folders`, `create_note_folder`, `update_note_folder` and `delete_note_folder`;
  - `list_notes` and `create_note` take a `folder_id`;
  - `list_data_sources`, `get_data_source`, `get_data_source_secrets` and `test_data_source`.
- **Scopes:** `datasources:read` reads sources without their secrets, `datasources:secrets` reads only the secrets, and `datasources:write` changes and tests sources.
- The search and the command palette find data sources by name, the palette offers **New Data Source**, and the usage report counts note folders and data sources.

### Changed

- `node cli.js vault:rotate-key` encrypts the secrets of data sources again too, in the same transaction as the vault.
- `PATCH /api/v1/notes/{id}` needs `version` only when it changes the title or the content; `folder_id` alone moves the note. A note token cannot move its note or see folders.
- Moving a note to the trash returns you to its folder.
- The buttons in a note's bar wrap onto a second row on a phone instead of running off the screen.
- The MCP `search` tool accepts `file` and `data_source` as types.
- Dependencies: the 14 minor and patch updates of Rua-Systems/manifold#33 and the GitHub Actions updates of Rua-Systems/manifold#32. `smol-toml` and `katex`, used only by the Markdown linter in development, are lifted past their advisories. The SvelteKit setting `csrf.checkOrigin: false` became `csrf.trustedOrigins: ['*']`, which does the same without the deprecation warning.

## 0.6.0 - 2026-10-10

Manifold gets a Files module: every stored file in one place, in folders, with previews, uploads of any type and simple image editing, and notes take any file. This release adds a database migration, which runs on start; take a backup before you update. `UPLOAD_MAX_BYTES` now defaults to 100 MB, so a reverse proxy in front of Manifold has to accept request bodies of 101 MB, such as `client_max_body_size 101m` in Nginx. A minor line such as `0.5` does not move to 0.6 by itself, so set `MANIFOLD_VERSION` to `0.6` or `0.6.0`.

### Added

- **Files:** **Files** in the sidebar lists every stored file. Your uploads sit in nested folders, and the files that notes, services and the API keep are listed as read-only sources. Upload with **Upload** or by dropping files on the list or on a folder, each file with its progress. Rename, move by dialog or by dragging, and delete. Filter all files by name, type and **Unused only**, and sort them by date, name or size. A file in use cannot be deleted; its page lists the notes and services that show it. See [Files](docs/files.md).
- **Previews:** images; PDF page by page, drawn in the browser by pdf.js; audio and video with seeking; text, CSV as a table and JSON indented. Any other file is only downloaded.
- **Image editing:** **Edit image** turns, flips and crops PNG, JPEG, WebP and GIF images and changes their brightness, contrast and saturation, or makes them black and white or sepia. The result is saved as a copy beside the original, which stays as it is.
- **Files in notes:** **Attach file**, pasting or dropping puts any file into a note; images show inline, other files as a link with their name and size. **Insert from Files** picks a stored file. While reading, a file link opens the file's page. See [Notes](docs/notes.md#images-and-files).
- **REST API:** `GET /api/v1/files` lists files by folder, owner, name, kind or use. `GET /api/v1/files/{id}/metadata` and `GET /api/v1/files/{id}/text` read a file's details and the start of a text file. `PATCH` and `DELETE /api/v1/files/{id}` rename, move and delete. `/api/v1/file-folders` manages folders, and an upload with a `folder_id` field lands in the Files module.
- **MCP:** `list_files`, `get_file`, `read_file_text` and `list_file_folders`, with `files:read`.
- The search and the command palette find files by name, the dashboard has a **Files** card, and the usage report counts folders and the files of the Files module.

### Changed

- Uploads may be any type and are written to disk as they arrive. `UPLOAD_MAX_BYTES` defaults to 100 MB, while note images and service icons stay at 10 MB at most. Images, PDF, audio, video and text are recognised from their content; any other file is stored as `application/octet-stream` and always sent as a download.
- Files are streamed from disk and answer `Range` requests with `206`. Only the types with a preview are sent inline, and a PDF opened directly as a page is downloaded.
- `POST /api/v1/files` accepts any file. File resources gain `kind`, `owner`, `in_files`, `folder_id` and `uses`.
- `files:read` and `files:write` belong to the Files module now, with the same ids. `files:write` is labelled **Change files**.
- Notes may link to files stored in Manifold (`/files/<id>`); such a link keeps the file in use.
- A restore copies the uploads that the restored file records name, of any type, instead of images only.

## 0.5.1 - 2026-10-08

The dashboard gets a fixed layout, framed buttons get a frosted backing, and focus mode works while reading. There are no database or configuration changes; a minor line such as `0.5` picks this release up by itself.

### Added

- **Focus mode while reading:** **Focus mode** shows a note alone over the whole screen while you read, not only while you write. **Edit** stays at the top inside it, so reading and writing switch without leaving it. See [Focus mode](docs/notes.md#focus-mode).

### Changed

- **Dashboard layout:** every card has a fixed place, and the cards of a row end on one line, so no hole opens beside a short card. On a wide page **Notes** and **Security and Access** stand side by side, **Map Notes** and **Usage** share the third column, and **Services** runs along the bottom with its shortcuts in rows. A narrower page has two columns, and a phone one. The cards are tighter, and with a mouse their lists have shorter rows. See [Dashboard](docs/dashboard.md).
- **Framed buttons:** buttons and controls with a frame get a translucent backing that blurs the dotted page behind them, and hovering tints that backing instead of replacing it. Icon buttons without a frame show it while active.
- Dependencies are updated within their minor versions, among them OpenLayers 10.11, TipTap 3.31.4, better-auth 1.7.7 and the MCP SDK 1.32.

### Fixed

- The text of **Measure Again** under **Settings → Usage**, and of the copy button in a note's share dialog, touched the button's frame.

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
