# Manifold maintainer guide

This guide is completed at the end of Batch 01. Until then it holds the decisions made while building the batch.

## Decisions

Choices the Batch 01 specification left open, with the reason for each.

### Phase 1: Foundation

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

### Phase 2: Email templates

- **A browser counts as new when its user agent hash is not in `known_user_agent`.** Sessions disappear on sign out and audit events expire, so neither can tell whether a browser was seen before. The table keeps only a SHA-256 hash of the user agent, per user.
- **Codes and notices are sent without awaiting the SMTP server.** Better Auth advises this for codes, so response timing reveals nothing; notices must never delay or fail a sign in or a password change. Failures are logged without the mail content.
- **Code mails end with the ignore notice, notices with the reason they were sent.** "If you did not ask for this code" does not fit a notice about a password change.
- **Mail times are shown in UTC with the zone name.** The server does not know the owner's time zone, and an unmarked local time would mislead.
- **The development preview is a `+server.ts` route** that returns one HTML page per template with both locales, each as an `srcdoc` iframe next to its text part. It answers `404` outside development.

### Phase 3: Module system, file storage and Services

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

### Phase 4: Notes

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

### Phase 5: Map Notes

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
