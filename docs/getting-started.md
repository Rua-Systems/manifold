# Concepts

This page introduces the ideas that the rest of the documentation builds on. Read it once before you install Manifold or start filling it with your own data.

## What Manifold is

Manifold is a private, self-hosted workspace for one person. It keeps the links to the services you run, your notes, notes placed on a map, and your passwords and keys behind a single owner account, and it lets your scripts and AI agents work with the same data through a REST API and an MCP server. Everything runs in one Node.js process next to a PostgreSQL database with PostGIS; uploaded images live in a folder of their own, `UPLOAD_DIR`. The name shown in the sidebar, in page titles and in mails comes from `ORGANIZATION_NAME`. Rate limits and the daily housekeeping run inside the app process, so always run exactly one app container per database. [Installation](installation.md) and [Configuration](configuration.md) cover the setup.

## One owner account

Manifold has exactly one account, the owner. It is created on the first start from `OWNER_USERNAME`, `OWNER_EMAIL` and `OWNER_PASSWORD` when the database holds no user yet; once the owner exists, these variables are ignored and you can remove them. There is no sign up and no way to add a second user. You sign in with your username or email address and your password, or with a code sent to your email address when mail is set up, followed by a code from your authenticator app when two factor authentication is on. [Your account](account.md) explains signing in, two factor authentication, sessions and the audit log.

## Modules

The features you work with come as modules. A module has its own page, its own entry in the sidebar and in the command palette and its own API scopes, and it takes part in the search.

| Module    | Page         | What it holds                                                                                     |
| --------- | ------------ | ------------------------------------------------------------------------------------------------- |
| Services  | `/services`  | Links to the services you run, with icons and in an order you choose. They also fill the sidebar. |
| Notes     | `/notes`     | Rich text notes with automatic saving, a history of versions and a trash.                         |
| Map Notes | `/notes/map` | Pins, lines and polygons on a map, each linked to a note. Map Notes is part of the Notes module.  |
| Vault     | `/vault`     | Passwords and keys, encrypted in the database and shown only after you confirm your identity.     |

Services is the page you land on after signing in. [Services](services.md), [Notes](notes.md), [Map Notes](map-notes.md) and [Vault](vault.md) describe each module.

## The sidebar and the account menu

The sidebar lists **Search**, the modules and **Settings**. **Services** and **Notes** are groups that open to show their items: every service, and for notes **Map Notes**, **New Note**, a filter, your most recently changed notes and **Show all**. **Vault** is a plain link. The button with the person icon in the top right corner opens the account menu, with **Settings**, the **Language** and **Theme** switches, and **Logout**.

## Search and the command palette

One search covers your notes, your services and the names of your vault entries. The command palette opens with `Ctrl+K`, or `Cmd+K` on a Mac, from every page you see while signed in, and with **Search** at the top of the sidebar. Type to narrow its entries: pages to go to, actions such as switching the theme or the language, your services, and from the second character on, search results from every module. The page at `/search` runs the same search without JavaScript. [Search and the command palette](search.md) has the details.

## Settings

**Settings**, in the sidebar and in the account menu, has four pages. **Profile** holds your display name, username, email address and password, your preferences, and an **About** section with the version. **Security** holds two factor authentication, the list of signed in sessions and the audit log. **API Keys** creates and revokes the keys for the REST API and the MCP server. **Data** downloads an export of everything, the same archive the backup command writes; [Backups and restores](backups.md) explains how to use it.

## API keys and scopes

Scripts and agents authenticate with API keys, which you create under **Settings → API Keys**. A key has a name, one or more scopes and an optional last day (UTC) after which it stops working. Creating a key asks you to confirm your identity; the full key, which starts with `mfd_`, is shown only once, and Manifold keeps only a hash of it. The list shows each key's scopes, its status (**Active**, **Expired** or **Revoked**) and when and from which address it was last used. **Revoke** stops a key at once; to rotate a key, create a new one and revoke the old one. Scopes are granted per module, and a write scope does not include reading: choosing a write scope in the form ticks its read scope too, and you can clear it again.

| Scope            | Grants                                                                              |
| ---------------- | ----------------------------------------------------------------------------------- |
| `services:read`  | Reading services.                                                                   |
| `services:write` | Adding, changing, ordering and deleting services.                                   |
| `notes:read`     | Reading notes and their history.                                                    |
| `notes:write`    | Creating and changing notes, moving them to the trash and back, restoring versions. |
| `map:read`       | Reading map geometries.                                                             |
| `map:write`      | Adding, changing and deleting map geometries.                                       |
| `vault:read`     | Reading the names, addresses and notes of vault entries, never their values.        |
| `files:read`     | Downloading uploaded files.                                                         |
| `files:write`    | Uploading images.                                                                   |

There is no scope that writes to the vault.

## The REST API and the MCP server

The REST API lives under `/api/v1` and the MCP server at `/mcp`. Both take an API key as a Bearer token, follow its scopes and share its rate limit, `API_RATE_LIMIT_PER_MINUTE`, which is 120 requests per minute by default. The API speaks JSON, pages long lists with cursors and describes itself in an OpenAPI 3.1 document at `/api/v1/openapi.json`. The MCP server offers tools that AI agents such as Claude Code call to search, read and write your notes, services and map geometries; a key sees only the tools its scopes allow. Writes through either are recorded in the audit log. [REST API](api.md) and [MCP server](mcp.md) describe both.

## Languages

The interface is available in English and Turkish, and the language follows the address. English pages have no prefix, such as `/notes`, and Turkish pages start with `/tr`, such as `/tr/notes`. **Language** in the account menu, or **Switch to Türkçe** in the command palette, opens the same page in the other language, and every link keeps you in the language you are using. Manifold does not pick the language from the browser, so bookmark the addresses in the language you want. Mails that answer something you do, such as a sign in code, use the language of the page you were on.

## Themes

Manifold has a light and a dark theme. **Theme** in the account menu switches between **Light** and **Dark** at once, and so does **Toggle light and dark theme** in the command palette. The choice is stored in the browser for a year. Once you are signed in, a browser that has no choice of its own starts with the **Default theme** you set under **Settings → Profile**; without one, it follows the light or dark preference of the device.

## Phones and desktops

The layout changes below a width of 768 pixels. On a desktop the sidebar sits on the left; **Collapse sidebar** shrinks it to a rail of icons, and on the rail the first click on a group opens the sidebar instead of leaving the page. On a phone the sidebar is a drawer: the top bar holds the menu button (**Open navigation**), the name of the instance and a search button that opens the command palette. Dialogs fill the screen, services are ordered with buttons instead of dragging, the note editor's toolbar scrolls sideways, and the map puts its tools below the map and the note in a sheet above them. Each browser remembers whether the sidebar is collapsed and which groups are closed.

## Where to go next

1. [Install Manifold](installation.md) with Docker Compose.
2. [Put it behind a reverse proxy](deployment.md) with TLS.
3. [Set up mail](email.md) for sign in codes, password resets and security notices.
4. [Sign in as the owner](account.md) and turn on two factor authentication.
