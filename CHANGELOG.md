# Changelog

All notable changes to Manifold are listed here. Versions follow [Semantic Versioning](https://semver.org/); before 1.0.0, a minor version may change configuration, the API or the data in incompatible ways, and its notes say so.

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
- A container image for amd64 and arm64 on the GitHub Container Registry, with a read-only root filesystem, an unprivileged user, a health check and a software bill of materials.
