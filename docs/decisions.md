# Decisions

The choices made while building Manifold that someone could reasonably have made differently, with the reason for each. The first build followed a written specification in eleven phases; the sections below follow those phases, and later changes follow them.

## Phase 1: Foundation

- **Protected routes are guarded in `hooks.server.ts`.** SvelteKit runs form actions before any layout `load`, so a layout guard alone would leave the actions of `(app)` pages open. `guardRequest` redirects page requests to sign in and answers everything else with `401`. The `(app)` layout load still asserts the session.
- **`/services` exists from Phase 1 as an empty page.** It is the post sign in target from Phase 1 on; Phase 3 replaces it with the services module.
- **Old `/dashboard` links answer `308` to `/services`.** Bookmarks keep working, including through sign in.
- **Better Auth tables use `timestamptz`.** Better Auth reads and writes JavaScript dates, so the column type is invisible to it, and every other table uses `timestamptz`.
- **The bootstrapped owner gets a random UUID as its id.** Better Auth ids are free text; a UUID is as good as Better Auth's own generator and needs no Better Auth instance, so the CLI can share the code.
- **Owner bootstrap holds an advisory transaction lock** and counts users inside it, so two app instances starting together cannot both create an owner.
- **Changing the email address takes effect at once, without a confirmation mail.** It must work without SMTP, and there is only one account. The address stays marked verified, because Better Auth's email code plugin removes the password of accounts whose address is unverified.
- **Sign in decides between username and email by the `@` sign.** Usernames cannot contain `@`, so the single identifier field is never ambiguous. Usernames match case insensitively; Better Auth stores them in lower case.
- **`Permissions-Policy` allows geolocation for the app itself and turns off camera, microphone, payment and USB.** Features the browser does not know are left out, because they only produce console warnings.
- **CSP `img-src` allows any `https:` source.** The map tile host is configured at runtime through `MAP_TILE_URL`, and the CSP is fixed at build time, so it cannot name the host. Scripts, styles, fonts and connections stay limited to the app itself.
- **`MAP_DEFAULT_CENTER` defaults to `0,20` with zoom `2`**, a neutral world view.
- **The desktop sidebar starts expanded.** It shows the organization name and the credit, which the icon rail cannot.
- **The account menu button shows a person icon**, because on phones the drawer button next to it already uses the three line menu icon.
- **The CLI is bundled with a second Vite config** (`vite.cli.config.ts`) into `build-cli/cli.js`. It reads the environment with the same Zod schema as the app; `npm run cli` loads the root `.env` for development.
- **`drizzle.config.ts` stays for `npm run db:studio` only.** It has no output folder; migrations are hand written.
- **Tests build their database URL from `POSTGRES_USER` and `POSTGRES_PASSWORD`** and always target `manifold_test` on `127.0.0.1:5432`, never `DATABASE_URL`, so no test can reach the development database or a remote one.
- **End to end tests run the production build (`node build`)**, not `vite preview`, so they cover adapter-node. Each test sends its own random `X-Forwarded-For` address (`ADDRESS_HEADER` and `XFF_DEPTH` are set for the test server), which keeps the sign in rate limiter from carrying over between tests. The tests run one at a time because they share one database and one owner.
- **Integration tests that create tables work in a schema of their own** (`test_<random>`, with `public` still on the search path for the extensions), so they never disturb the seeded schema other tests read.
- **Migration checksums ignore line endings, and the repository forces LF** (`.gitattributes`). A Windows checkout with CRLF and the Linux image would otherwise disagree about files that did not change, and the app would refuse to start.

## Phase 2: Email templates

- **A browser counts as new when its user agent hash is not in `known_user_agent`.** Sessions disappear on sign out and audit events expire, so neither can tell whether a browser was seen before. The table keeps only a SHA-256 hash of the user agent, per user.
- **Codes and notices are sent without awaiting the SMTP server.** Better Auth advises this for codes, so response timing reveals nothing; notices must never delay or fail a sign in or a password change. Failures are logged without the mail content.
- **Code mails end with the ignore notice, notices with the reason they were sent.** "If you did not ask for this code" does not fit a notice about a password change.
- **Mail times are shown in UTC with the zone name.** The server does not know the owner's time zone, and an unmarked local time would mislead.
- **The development preview is a `+server.ts` route** that returns one HTML page per template with both locales, each as an `srcdoc` iframe next to its text part. It answers `404` outside development.

## Phase 3: Module system, file storage and Services

- **A module manifest has two halves.** `manifest.ts` holds what the browser may see (id, label, icon, sidebar position and kind, API scopes); `manifest.server.ts` holds what only the server may run (sidebar contents, file references, housekeeping, and later the API handlers, MCP tools and search). One file with both would pull database code into the client bundle, which SvelteKit refuses. `registry.ts` and `registry.server.ts` list the two halves, and a unit test fails when their module ids differ.
- **Module server code uses the `.server.ts` suffix** (`services.server.ts`, `schema.server.ts`), so SvelteKit keeps it out of the browser even though it lives outside `src/lib/server/`.
- **Module tables are mirrored inside their module** (`schema.server.ts`) and are not part of the core Drizzle schema object; module code imports its own tables.
- **Sidebar preferences live in a cookie, not in `localStorage`.** The server can then render the sidebar collapsed or expanded, with the right groups open, without a flash after hydration. The cookie lists closed groups, so a new module's group starts open.
- **On the icon rail, the first click on a group opens the sidebar and the group without navigating.** Once the sidebar is open, the group label navigates to the module page and opens the group.
- **Request bodies are limited in `hooks.server.ts` by their `Content-Length`**: multipart uploads may be `UPLOAD_MAX_BYTES` plus 256 KB for the other fields, every other body 5 MB, and a chunked body without a length gets `411`. adapter-node's own 512 KB limit is lifted with `BODY_SIZE_LIMIT=Infinity`, because one global limit cannot serve both.
- **The `file` table also has `updated_at`,** following the general table convention, although files are never edited.
- **`/files/[id]` sits outside the protected route group,** so a request without a session gets `401` rather than a redirect to the sign in page.
- **Unreferenced files are deleted in one statement** that checks every registered reference with `NOT EXISTS`, so a reference written meanwhile keeps its file. The bytes are removed after the rows.
- **Services are cards at every width.** Drag and drop uses the browser's native drag events and is a mouse gesture; touch and keyboard users reorder with the move buttons, and phones hide the drag grip.
- **Dialogs use the native `<dialog>` element** with `showModal()`, which brings focus trapping, Escape to close and an inert page behind it.
- **End to end tests that post to a form action without JavaScript send `Accept: text/html`.** With `*/*`, SvelteKit answers as it does to its own fetch requests: status 200 with the failure inside the JSON body.

## Phase 4: Notes

- **Edra is used through its headless variant, copied rather than installed.** Edra 3.1.3's headless files need neither Tailwind nor shadcn, only small edits (a class name helper and a theme watcher). `src/lib/components/edra/tiptap/` holds Edra's Svelte 5 bindings for TipTap unchanged apart from formatting and an `untrack` that silences a Svelte warning; `headless/` holds the parts of its UI that notes use (toolbar, link and table bubble menus, code block view), rewritten against the project's SCSS and messages. Edra's CLI was not run, because it installs unpinned packages with `--legacy-peer-deps`; the TipTap packages are listed in `package.json` like every other dependency and locked by `package-lock.json`. Its AI, Mermaid, math, iframe, audio, video, callout, colour, font size, alignment, export, slash command and drag handle features are left out, as the spec's content list does not include them.
- **One extension list, `src/lib/modules/notes/extensions.ts`,** serves the editor, the server validation and the Markdown conversion. The browser adds Edra's code block view with `extend()`, which leaves the schema unchanged, and a placeholder, which is not part of the schema.
- **Server validation builds the document with ProseMirror's `Node.fromJSON` and `check()`** against the shared schema and stores the result's JSON, so unknown node, mark or attribute data never reaches the database. Images must point to `/files/<uuid>` on this instance, which keeps outside trackers out of notes and lets file clean up see every image. Uploads refuse SVG, as note images are raster only.
- **Revisions: the owner's edits within five minutes of the current revision's creation update that revision** rather than adding one, so every editing session leaves its final state in the history without one row per autosave. A different actor, an older revision, and every API, MCP or restore write add a new revision. A revision records the version it reached. Actors of type `cli` are recorded as `system`, the column's third value.
- **`note_file` lists the files the current content or any revision of the note shows.** Restoring an old revision then brings its images back. A file leaves the list only when no version shows it any more, and the housekeeping job removes it a day later if nothing else refers to it.
- **`/notes/new` shares the `/notes/[id]` route** through the `noteId` parameter matcher. The first save creates the note, so opening "New note" and leaving creates nothing. The page then moves to `/notes/<id>` with `goto(..., { replaceState: true })` while the editor stays mounted: the page component keys the editor on a draft key it keeps itself, because `invalidate()` resets `page.state`.
- **Autosave posts to the page's form actions with `fetch` and `deserialize`** (`?/create`, `?/save`, `?/upload`), one request at a time. Pending changes are also saved on blur, before a navigation and when the tab is hidden. Editing needs JavaScript, since TipTap has no form fallback; the notes list, its filter and the trash work without it.
- **The save state labels share one grid cell,** so the widest label sets the width and switching between them moves nothing. **The conflict notice is fixed to the bottom of the viewport** for the same reason.
- **History previews use `?revision=<version>` on the note page,** rendered by the same editor in read only mode, with "Restore" as a form action.
- **Lists show relative times** ("5 minutes ago"). They read the same on the server and in the browser whatever the time zones, so hydration does not change the text.
- **The sidebar's `load` depends on `app:sidebar`,** which the editor invalidates after every save, since titles and the order by last update change.
- **The notes list reads only the first 720 characters of `content_text`** and shows 180 of them as the excerpt. The trash lists notes by the time they were trashed.
- **Code blocks are highlighted with lowlight's `common` language set,** coloured through theme tokens. The note page's script is about 690 kB minified (TipTap, ProseMirror and lowlight) and loads only on note pages.
- **The toolbar is one horizontally scrolling row on phones,** rather than several rows of 44 px buttons above the text.
- **Raw HTML in Markdown input is dropped by replacing `parseHTMLToken` on the Markdown manager instance,** because `@tiptap/markdown` has no option for it. Unit tests cover this and a round trip for every node type.
- **The "Map Notes" sidebar item arrives with Phase 5,** together with the page it links to.

## Phase 5: Map Notes

- **The map page loads every geometry of the notes outside the trash in its `load`.** A bounding box query, loading what the view shows as it moves, should replace this if the number of geometries grows past a few thousand.
- **OpenLayers 10 is imported by file (`ol/Map.js`),** as the package has no exports map; `@types/geojson` supplies the GeoJSON types it refers to. Only canvas layers are used, so no web workers are created and the CSP needs no `worker-src`.
- **OpenLayers objects stay out of Svelte state.** `MapController` owns the map, its layers and the interactions of the current tool; components drive it through methods and hear back through callbacks. The map is created in an attachment whose body runs untracked, because an attachment reruns when state it reads changes, which would rebuild the map.
- **Canvas colours come from theme tokens** (`--color-map-feature`, `--color-map-selected`, `--color-map-sketch`), read when the map starts and again when the theme changes, since canvas styles cannot use CSS variables.
- **Geometries use a Drizzle custom type for `geometry(Geometry, 4326)`,** because Drizzle's own `geometry()` handles only points. Reads select `ST_AsGeoJSON(geometry, 7)`: seven decimals of a degree are about a centimetre.
- **Validation runs in two steps:** a Zod schema for the shape (Point, LineString or Polygon, two dimensional positions within longitude and latitude, at most 10,000 vertices), then PostGIS's `ST_IsValid`, which also catches unclosed rings and self intersections. Check constraints on `map_feature` repeat the kind, validity and vertex rules for writers that skip the application. A geometry's kind follows its type, and moving vertices cannot change it.
- **The map calls its page's form actions with `fetch` and `deserialize`:** `openNote` (the note for the feature panel), `createFeature`, `updateFeature` and `deleteFeature`. `openNote` is a form action although it only reads, because the application's own pages talk to the server through `load` and form actions only. The note editor in the panel posts to the note page's actions, exactly as on `/notes/[id]`.
- **The feature panel shows the note page's editor in a "host" mode:** history, previews, restores and trashing happen inside the panel without navigating. Closing the panel or selecting another note saves pending changes first.
- **"New note" on the map creates the untitled note and its geometry in one transaction.** After a drawing finishes, the tool returns to Select, so a drawing waits for its note before the next one starts.
- **Attach mode is `/notes/map?attach=<id>`; "Show on map" is `/notes/map?note=<id>`,** which fits the view to the note's geometries and opens the first one. The attach parameter is dropped from the address once used or cancelled.
- **The last view is kept in `localStorage`** (`manifold.map.view`), since it matters only to the browser that saw it. Unreadable or missing storage means the default view.
- **The delete tool and "Unlink and delete this geometry" ask for confirmation,** as the deletion cannot be undone; the note always stays. Clicking the empty map closes the panel.
- **"Undo last point" and "Cancel drawing" are buttons as well as keys** (Escape cancels), since phones have no keyboard. Hit and snap tolerances are 8 and 12 pixels, which suit fingers.
- **On phones the toolbar is a row below the map rather than over it,** so the map's attribution stays visible, and the sheet sits on top of the toolbar. Dragging the sheet's handle up or tapping it switches between half and full height; dragging down from half height closes it. The map workspace is exactly the viewport's height, and the panel scrolls inside it.
- **OpenLayers' zoom buttons move to the bottom left,** away from the toolbar; rotation is off and the attribution is collapsible.
- **The note page's location map is still,** without panning or zooming, so it never captures page scrolling; "Show on map" is where geometries are explored.
- **The note picker lists at most 50 matches** and reloads the titles when it opens.
- **End to end tests draw with synthetic pointer events** on the map's viewport, of type `mouse` on desktop and `touch` on phones, over a random spot per test so that other tests' geometries never interfere. Map tiles are answered with a one pixel image, so tests never reach the tile host.

## Phase 6: Security features and settings

- **Two factor sign in with an emailed code reuses Better Auth's challenge.** Better Auth asks for the second factor only after password sign ins. A small plugin (`email-code-two-factor.ts`) does the same after `/sign-in/email-otp`: it deletes the new session and sets the twoFactor plugin's own challenge cookie and records, so `verifyTOTP` and `verifyBackupCode` finish both kinds of sign in.
- **The TOTP setup hands its `otpauth://` address back through a hidden field** between "Set up" and "Turn on", so a wrong code can show the same QR code again. The server only rebuilds the image from it; Better Auth checks the code against the secret it stored.
- **QR codes are rendered on the server as SVG and shown as a `data:` image,** which needs no client library, no inline SVG and no change to the CSP.
- **Backup codes are shown once, right after they are made, with a download button** that saves them as a text file from the browser. They are read back through Better Auth's server-only `viewBackupCodes` after the first valid code.
- **Turning two factor off and making new backup codes ask for the password and a code in their own form.** Better Auth needs the password for both anyway, and entering both on the spot is the step-up these actions require, so the dialog would only ask twice.
- **Step-ups live in `session_step_up`,** one row per session that goes with it. The dialog is part of the signed in layout; a form whose action answers `stepUp: true` opens it and submits again once confirmed. Without JavaScript the same form links to `/step-up`, which returns to the page afterwards. Email and password changes use it in this phase.
- **Step-up checks the password with Better Auth's `verifyPassword` and the code with `verifyTOTP`,** which only checks the code when the session already has two factor turned on. Step-up attempts are rate limited like sign ins and recorded in the audit log.
- **Sessions are listed and revoked straight from the `session` table,** by id. Better Auth's `listSessions` endpoint answers tokens and needs a fresh session; tokens never leave the server here. The current session is signed out with the normal sign out.
- **Audit events carry no identifiers from failed sign ins.** A mistyped password can end up in the username field, so a failed attempt records only the method, the address and the device.
- **Audit times are shown in UTC,** like mail times, because the server does not know the owner's time zone; the date filters are UTC days too.
- **User settings are columns on `user_setting`:** `locale` and `theme`, where null means "not chosen". The locale is for mails sent outside a request (`preferredLocale()`) and, since the public repository was prepared, for the security notices; codes keep using the request's locale. The theme is what a browser without its own theme cookie starts with. Both are cached in memory and replaced on save.
- **Settings has two pages:** Profile (profile, preferences, email, password, about) and Security (two factor, sessions, audit log), with links between them.
- **The CLI records the commands that change data** (`migrate` when it applied something, `owner:reset-password`, `owner:disable-2fa`) with the actor type `cli`.

## Phase 7: API keys and REST API

- **One endpoint serves the whole API.** `src/routes/api/v1/[...path]/+server.ts` hands every request to a router that matches it against the route definitions: the core's (`/me`, `/files`) and each module's, from the `api` field of its server manifest. The same definitions, with their Zod schemas, build the OpenAPI document, so a module adds routes without touching the router or the document.
- **The router's order is fixed:** find the route (404 or 405), authenticate the Bearer key (401), count the key's rate limit (429), check the scope (403), validate path, query and body (400), then run the handler. A module's `ValidationError` answers 422, `NotFoundError` 404, a version conflict 409 with `current_version`, and a refused upload 413 or 422.
- **Error messages of the API are English and meant for developers;** field messages coming from the modules' validation keep the request's locale, as in the UI.
- **Keys look like `mfd_<prefix>_<secret>`.** The prefix is 8 lowercase letters and digits and finds the row; a revoked, expired or unknown key answers the same 401, so a response never tells which. Rotating a key is revoking it and creating another; only creation needs the step-up.
- **API writes are recorded in the audit log by the router** after the handler succeeds, with the route's action (`note.update`, `map_feature.create` and so on), the key as actor and the target the handler reports. Reads only update the key's `last_used_at` and `last_used_ip`.
- **Cursor paging uses keyset cursors** (last update and id for notes, creation time and id for map features) wrapped in opaque base64url. Services and revisions are short lists and page by offset behind the same kind of cursor. Pages are `{ "data": [...], "next_cursor": ... }`; the map's list is a GeoJSON FeatureCollection with `next_cursor` as a foreign member.
- **API JSON uses snake_case field names,** like the query parameters the specification names (`include_trashed`, `note_id`).
- **`DELETE` answers 204;** writes that change a record answer the record.
- **Services through the API are alias and address only.** Icons are uploaded on the Services page; the API shows them as `icon_url`.
- **Files uploaded through the API are images only** (the file store accepts nothing else in this batch) and belong to no module. Like every file, one that no note or service refers to is deleted after a day.
- **Map features created through the API may bring their note along** as `note` (title and content or Markdown), created in the same transaction.
- **SvelteKit's own cross-site form check is turned off and run in `hooks.server.ts` instead,** for every path except `/api/`. SvelteKit refuses any multipart post without a matching `Origin` header, which API clients uploading files do not send, and its check cannot leave out a path. The API authenticates by Bearer key only, never by cookie, so a cross-site form cannot act as the owner there. `csrf.checkOrigin` is deprecated and makes the build print a warning; `csrf.trustedOrigins` cannot express "no Origin".
- **The request body limit answers in the API's error format under `/api/`** and as plain text elsewhere.

## Phase 8: Vault

- **Values are sealed with AES-256-GCM** under `ENCRYPTION_KEY`, with a random 12 byte IV per value and the row id as additional authenticated data, so a ciphertext copied onto another row does not open. The id is chosen before the insert for that reason.
- **`key_version` is the number of rotations a value went through.** New values take the highest version in the table; the rotation command raises every row to the next one. The app itself only ever holds the current key.
- **Rotation runs in one transaction and changes nothing if the current key fails to open any value.** It takes the new key from `NEW_ENCRYPTION_KEY` or a hidden prompt, so it works both in scripts and by hand, never prints a key, and does not touch `updated_at`, since the values did not change.
- **The crypto and rotation code has no app dependencies** (`crypto.server.ts`, `rotation.server.ts`), so the CLI bundle can use it.
- **Revealing and copying post the same form action,** which answers the value only after a step-up. The page keeps a revealed value in memory for 30 seconds and never in the address, storage or a cookie. A copy goes straight to the clipboard. Both are audited (`vault.reveal`, `vault.copy`), as are create, update, value change (`vault.update_value`) and delete, and `last_revealed_at` is set.
- **Adding a secret needs no step-up;** changing a value does, while changing only its name, address or notes does not. The specification asks for step-up on revealing and editing values; adding one reveals nothing.
- **Without JavaScript, "Reveal" shows the value on the returned page** and the step-up page is linked when it is due.
- **Values are limited to 10,000 characters,** names to 100 and notes to 500.
- **The vault is a sidebar link, not a group,** after Notes.
- **The API has two routes, both reads, both metadata only.** A test checks that no vault route writes and that responses carry no value or ciphertext.

## Phase 9: Search and command palette

- **A note matches when a word of its title or text starts with each query word, or its title contains the query or looks like it.** The first uses the generated `search_vector` with prefix terms (`trip:*`), so results come while typing; the others use `pg_trgm` (`ILIKE` and `%`). Query words are reduced to letters and digits, so input can never carry tsquery operators.
- **The indexed text is capped at 200,000 characters** of `content_text`, because a tsvector has a size limit and a 2 MB note would exceed it.
- **Scores run from 0 to 1 in every provider,** so hits of all modules sort together: `ts_rank_cd` with normalization 32, trigram similarity, and 0.9 for a title or alias that contains the query outright.
- **Snippets come from `ts_headline`** over the first 20,000 characters, without markup, because the page renders them as text.
- **The vault's provider searches names and addresses only;** a hit leads to `/vault`, where values still need a step-up.
- **The search is reached through a form action** (`/search?/search`) by the palette and the sidebar filter, like the map's reads, and `/search?q=` is a page of its own for browsers without JavaScript. `GET /api/v1/search` needs a valid key and quietly leaves out the modules the key has no read scope for.
- **Sidebar groups can hand their filter to the search** (`filterSearch`). The notes filter then finds notes beyond the hundred listed; while the search answers, the listed items are narrowed at once.
- **Modules offer palette entries in their client manifest** (`commands`), next to "Go to" entries made from every module page. Core entries cover the settings pages, the theme, the other locales and signing out. Services come from the sidebar data the layout already has, and open in a new tab.
- **"New service" opens `/services?new`,** which starts the Services page with its form open.
- **The palette follows the ARIA combobox pattern:** focus stays in the input, `aria-activedescendant` names the highlighted option, and options are not in the tab order. On desktop it also opens from a "Search" entry at the top of the sidebar, since there is no top bar there; on phones from the top bar.

## Phase 10: MCP server

- **The v1 SDK, `@modelcontextprotocol/sdk`, as the specification names it,** with its web standard streamable HTTP transport, which takes and returns `Request` and `Response` like a SvelteKit endpoint. A new server and transport answer each request (stateless, JSON responses, no sessions), so nothing is kept between calls.
- **Each request authenticates with an API key and gets a server holding only the tools the key's scopes allow,** so `tools/list` follows the scopes and calling a missing tool fails. Requests count against the key's REST rate limit.
- **Tools run the REST routes' handlers,** found by method and path, so validation, service functions and output shapes are shared; the tool layer only maps arguments and trims answers. Note tools read and write Markdown only; the TipTap JSON is left out of their answers.
- **Tool errors are answered as tool results with `isError`,** carrying the REST error body, so a version conflict reaches the agent with its `current_version`.
- **Writes are audited with `via: mcp`** in the metadata, next to the same actions as the REST API.
- **`search` is a core tool open to every key,** searching only the modules the key may read, like `GET /api/v1/search`.
- **The server names itself after the instance** (`ORGANIZATION_NAME`) and reports the app version.

## Phase 11: Backup, documentation and wrap-up

- **The archive is written with a small ustar writer of its own** (`src/lib/server/backup/tar.ts`), because its entries come from two places (a temporary folder and `UPLOAD_DIR`) under names of the archive's choosing; the `tar` package reads archives back, since reading must cope with every variant.
- **The dump goes to a temporary file first,** because a tar header needs the size before the content.
- **Restoring over a database with data (`--force`) drops every schema but the system ones and recreates `public`,** extensions included. The PostGIS image adds `tiger` and `topology` next to `public`, and the dump would collide with them; whatever the old database held comes back only if the dump holds it.
- **A forced restore empties `UPLOAD_DIR` instead of removing it,** because in the container the folder is a mounted volume and cannot be removed.
- **`backup` opens the target file before any work** and refuses a file that already exists or a folder that is missing, so a wrong path fails at once and a failed backup leaves no half written archive behind.
- **Only `/data/uploads` was a volume in the first container,** so an archive written elsewhere under `/data` was lost when the container was recreated, and the README copied it out with `docker compose cp` right after the backup. Since the public repository was prepared, all of `/data` is one volume, see below.
- **"Is the database empty" means no table of its own in `public`;** PostGIS's `spatial_ref_sys` does not count.
- **When `pg_dump` is missing, the dev compose database container's tools are used** through `docker compose exec`. The production image always has them; the fallback lets development machines and the tests run backups without installing PostgreSQL.
- **The export is a download link, not a form:** `/settings/data/export` streams the archive, and sends the owner through `/step-up` and back when the step-up is due, which also works without JavaScript.
- **Backups and restores from the CLI are audited** (`data.backup`, `data.restore`), as is the export (`data.export`).

## Preparing the public repository

- **The application sits at the repository root,** like Servitor CMS by the same authors, instead of in a subfolder (first `frontend-manifold/`, briefly `app/`). One `package.json`, one Docker build context and one Dependabot directory keep continuous integration, the image build and the documentation simple.
- **`docker-compose.yml` publishes the app on `127.0.0.1:3000`** for a reverse proxy on the same host, and Coolify gets a Compose file of its own in the deployment guide. The override example that published the port is no longer needed.
- **The container is hardened:** a read-only root filesystem, no Linux capabilities, `no-new-privileges`, a health check in Node instead of `wget`, npm removed from the runtime image and a CycloneDX software bill of materials at `/app/sbom.cdx.json`. The database container gets `no-new-privileges` only, because its entrypoint needs its capabilities to switch users.
- **One volume at `/data` holds everything the app writes:** `uploads/`, `backups/` and `tmp/`. `TMPDIR` points at `/data/tmp`, so the dump and the extracted archive of a large backup do not have to fit into the memory of a tmpfs; the backup code creates the folder when a bind mount starts empty.
- **`backup` without a path writes to `backups/` next to the upload folder** (`/data/backups` in the container, `.data/backups` in development), because the working directory of the container is read-only. No new variable was added for it.
- **`ADDRESS_HEADER` and `XFF_DEPTH` can be set in `.env`,** with `x-forwarded-for` and `1` as the Compose defaults, so the app can also be tried on `localhost:3000` without a proxy. `PROTOCOL_HEADER` and `HOST_HEADER` were dropped: adapter-node ignores them while `ORIGIN` is set, and it always is.
- **Releases are published as images** for amd64 and arm64 on the GitHub Container Registry, and `docker-compose.yml` names the image with `MANIFOLD_VERSION` next to `build: .`. The first release is 0.1.0.
- **`@sveltejs/enhanced-img` was removed** with the sign-in photo it served. It pulled in `sharp` with known high severity vulnerabilities, and the placeholder needs no image processing. The `cookie` and `esbuild` overrides from Servitor CMS clear the remaining low and moderate advisories, so `npm audit` reports none.
- **Markdown and YAML are indented with two spaces,** through a Prettier override: YAML cannot hold tabs and markdownlint refuses them in Markdown. Everything else keeps tabs.
- **Continuous integration builds before it type-checks,** because `svelte-check` needs the messages that the Paraglide Vite plugin compiles, and it installs the PostgreSQL 17 client tools, because the runner's older `pg_dump` refuses to back up a newer server.
- **Project instructions for AI agents stay out of the repository,** like in Servitor CMS; the conventions they held for humans are in [Development](development.md).
- **Security notices use the owner's chosen mail language,** when there is one, instead of the language of the request. Someone else can cause a new sign in notice from a page in another language, and until then the preference had no mail to apply to. Codes answer the page they were requested on and keep its language.
- **Releases deploy themselves through Coolify's deploy webhook,** called by the last job of the release workflow once the image is published. The webhook address and the API token are repository secrets; without them the job skips with a notice, so forks and installations without Coolify need nothing. Coolify pulls a minor line tag such as `0.1` again on every deployment, which takes patch releases automatically but never a new minor version.
