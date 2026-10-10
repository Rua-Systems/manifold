# REST API

The REST API under `/api/v1` gives scripts and other applications access to your services, notes, map features, uploaded images, the names in your vault and the usage report. It speaks JSON with snake_case field names, authenticates every request with an API key and is described in OpenAPI 3.1 at `/api/v1/openapi.json`. AI agents use the same keys through the [MCP server](mcp.md).

## API keys

Every request needs an API key. You create keys under **Settings → API Keys**:

1. Enter a **Name** that tells where the key is used, for example the name of a script. It may have up to 100 characters.
2. Choose the **Scopes** the key needs, see [Scopes](#scopes). Choosing a write scope also selects the read scope that goes with it; clear that one by hand if the key should not read.
3. Choose a date under **Expires after** if the key should stop working. It works until the end of that day in UTC. Leave the field empty for a key that does not expire.
4. Tick **Save a copy in the Vault** if you want to read the key again later, see [Copies in the vault](#copies-in-the-vault).
5. Choose **Create Key**. If you have not confirmed your identity in the last ten minutes, the **Confirm Your Identity** dialog asks for your password, and for a code from your authenticator app when two-factor authentication is on.
6. Copy the key with **Copy Key**. It starts with `mfd_` and is shown only once.

Manifold stores only a SHA-256 hash of the key and a short prefix to find it. The list under **API Keys** shows each key's name, prefix, scopes, expiry date, when and from which address it was last used, whether it has a copy in the vault, and its status: **Active**, **Expired** or **Revoked**. **Revoke** ends access at once, after a confirmation, and cannot be undone; the key stays in the list as **Revoked**. **Delete** removes a key from the list for good, after a confirmation, whatever its status; an active key stops working at the same moment. The audit log keeps the key's events either way.

A key cannot be changed after it is created. To give a program other scopes, create a new key and revoke the old one. Creating and revoking keys is recorded in the audit log, see [Your account](account.md). Treat keys like passwords: keep them in the configuration of the program that uses them, never in public code.

### Note tokens

A note token, created with **Share** on a note's page as described in [Sharing a note](notes.md#sharing-a-note), is a key for that one note. It starts with `mfn_` and is sent like an API key, as `Authorization: Bearer mfn_...`.

- It reaches `GET /api/v1/me`, `GET /api/v1/notes/{id}` and, with **Read and edit**, `PATCH /api/v1/notes/{id}`, for its own note only. Another note's id answers `404 not_found`, as if the note did not exist, and every other route `403 insufficient_scope`.
- `GET /api/v1/me` answers its name, the scopes its access stands for (`notes:read`, and `notes:write` with edit access), its last day and `note` with the note's `id` and `access`. For an API key, `note` is `null`.
- `/files/{id}` serves it the images its note shows, and no other file.
- It has its own rate limit of `API_RATE_LIMIT_PER_MINUTE`, shared with the share link's page and its saves. Changes are recorded with `note_token` as the actor type.
- Every note token expires, on the day chosen when it was created. Unknown, revoked and expired tokens, and those of a note in the trash, get the same `401 invalid_key` as an invalid API key.

### Copies in the vault

With **Save a copy in the Vault** ticked, the key is also saved in the [vault](vault.md), encrypted like every other entry, in the same step that creates it: either both exist or neither does. The page still shows the key once and adds **A copy is saved in the Vault.**

- The entry is named **API key:** followed by the key's name, cut to the vault's 100 characters. Its service address is the address of your Manifold, and its notes list the scopes. You may rename it or change its notes like any entry.
- In the vault, **Reveal** and **Copy** give you the key again, after you confirm your identity.
- The key's card under **API Keys** says **Copy in the Vault**. **Revoke** and **Delete** then warn that the copy goes too, and delete it together with the key. The audit log records `vault.create` and `vault.delete` for the copy next to `api_key.create`, `api_key.revoke` and `api_key.delete`.
- A key that expires keeps its copy; delete it in the vault when you no longer need it. Deleting the copy leaves the key working.

The box is not ticked by default: a key without a copy exists nowhere but in the program you give it to.

### Scopes

Each module has its own scopes, and uploaded files and the usage report have theirs:

| Scope            | Label in the form                   | Allows                                                                                   |
| ---------------- | ----------------------------------- | ---------------------------------------------------------------------------------------- |
| `services:read`  | **Read services**                   | Listing and reading services.                                                            |
| `services:write` | **Change services**                 | Adding, changing, reordering and deleting services.                                      |
| `notes:read`     | **Read notes**                      | Listing and reading notes and their revisions.                                           |
| `notes:write`    | **Change notes**                    | Creating, changing, trashing and restoring notes, and restoring revisions.               |
| `map:read`       | **Read map features**               | Listing and reading map features.                                                        |
| `map:write`      | **Change map features**             | Adding, changing and deleting map features, and creating a note together with a feature. |
| `vault:read`     | **Read vault names (never values)** | Listing and reading the name, address and description of vault entries.                  |
| `files:read`     | **Read files**                      | Downloading uploaded files.                                                              |
| `files:write`    | **Upload files**                    | Uploading images.                                                                        |
| `usage:read`     | **Read the usage report**           | Reading the usage report: counts and sizes, the database, the disk and the server.       |

- A write scope does not include the read scope. A key with only `notes:write` can create and change notes, but it cannot list or read them.
- `vault:read` never sees a value. No API route and no MCP tool returns or accepts a vault value; values are revealed only in the app, after you confirm your identity. See [Vault](vault.md).
- `GET /api/v1/me`, `GET /api/v1/search` and `GET /api/v1/openapi.json` work with any valid key. The search covers only the modules the key may read. Note tokens reach less, see [Note tokens](#note-tokens).

## Authentication

Send the key as a bearer token in the `Authorization` header:

```bash
curl -H "Authorization: Bearer mfd_your_key" "https://manifold.example.com/api/v1/me"
```

`/api/v1/me` describes the key that made the request:

```json
{
  "name": "Backup script",
  "scopes": ["notes:read", "notes:write"],
  "expires_at": null,
  "note": null
}
```

- A request without a key is answered with `401 missing_key`, and an unknown, malformed, revoked or expired key with `401 invalid_key`. Both answers carry a `WWW-Authenticate` header. Every kind of invalid key gets the same answer, so the response never tells which one it was.
- The API never reads cookies. Being signed in to Manifold in the browser grants no API access.
- Every accepted request records when and from which address the key was last used.

Always use an `https` address: a key sent over plain HTTP crosses the network in clear text. Reverse proxies set up as in [Deployment](deployment.md) refuse plain HTTP requests that carry a key.

## Endpoints

| Method   | Path                                             | Scope            | Purpose                                                           |
| -------- | ------------------------------------------------ | ---------------- | ----------------------------------------------------------------- |
| `GET`    | `/api/v1/me`                                     | any key          | The key itself: name, scopes and expiry.                          |
| `GET`    | `/api/v1/openapi.json`                           | any key          | The OpenAPI 3.1 document of this API.                             |
| `GET`    | `/api/v1/search`                                 | any key          | Search across the modules the key may read.                       |
| `GET`    | `/api/v1/services`                               | `services:read`  | Services in their sidebar order, paged.                           |
| `POST`   | `/api/v1/services`                               | `services:write` | Add a service at the end.                                         |
| `PUT`    | `/api/v1/services/order`                         | `services:write` | Put all services in a new order.                                  |
| `GET`    | `/api/v1/services/{id}`                          | `services:read`  | One service.                                                      |
| `PATCH`  | `/api/v1/services/{id}`                          | `services:write` | Change the alias, the address or both.                            |
| `DELETE` | `/api/v1/services/{id}`                          | `services:write` | Delete a service.                                                 |
| `GET`    | `/api/v1/notes`                                  | `notes:read`     | Notes by last update, newest first, paged.                        |
| `POST`   | `/api/v1/notes`                                  | `notes:write`    | Create a note.                                                    |
| `GET`    | `/api/v1/notes/{id}`                             | `notes:read`     | One note with its content, also from the trash.                   |
| `PATCH`  | `/api/v1/notes/{id}`                             | `notes:write`    | Change a note, based on the version you read.                     |
| `DELETE` | `/api/v1/notes/{id}`                             | `notes:write`    | Move a note to the trash.                                         |
| `POST`   | `/api/v1/notes/{id}/restore`                     | `notes:write`    | Take a note out of the trash.                                     |
| `GET`    | `/api/v1/notes/{id}/revisions`                   | `notes:read`     | A note's revisions, newest first, paged.                          |
| `GET`    | `/api/v1/notes/{id}/revisions/{version}`         | `notes:read`     | One revision with its content.                                    |
| `POST`   | `/api/v1/notes/{id}/revisions/{version}/restore` | `notes:write`    | Restore a revision as a new version.                              |
| `GET`    | `/api/v1/map/features`                           | `map:read`       | Map features as a GeoJSON FeatureCollection, oldest first, paged. |
| `POST`   | `/api/v1/map/features`                           | `map:write`      | Add a feature, linked to an existing or a new note.               |
| `GET`    | `/api/v1/map/features/{id}`                      | `map:read`       | One feature.                                                      |
| `PATCH`  | `/api/v1/map/features/{id}`                      | `map:write`      | Replace a feature's geometry.                                     |
| `DELETE` | `/api/v1/map/features/{id}`                      | `map:write`      | Delete a feature. Its note stays.                                 |
| `GET`    | `/api/v1/map/basemaps`                           | `map:read`       | The basemaps added to the map, in their order, paged.             |
| `POST`   | `/api/v1/map/basemaps`                           | `map:write`      | Add a basemap at the end.                                         |
| `GET`    | `/api/v1/map/basemaps/{id}`                      | `map:read`       | One basemap.                                                      |
| `PATCH`  | `/api/v1/map/basemaps/{id}`                      | `map:write`      | Change a basemap, or put it in use.                               |
| `DELETE` | `/api/v1/map/basemaps/{id}`                      | `map:write`      | Delete a basemap.                                                 |
| `GET`    | `/api/v1/vault/secrets`                          | `vault:read`     | Vault entries by name, without their values, paged.               |
| `GET`    | `/api/v1/vault/secrets/{id}`                     | `vault:read`     | One entry's name, address and description.                        |
| `POST`   | `/api/v1/files`                                  | `files:write`    | Upload a file.                                                    |
| `GET`    | `/api/v1/files/{id}`                             | `files:read`     | Download a file.                                                  |
| `GET`    | `/api/v1/usage`                                  | `usage:read`     | The usage report, measured now.                                   |

A method that a path does not accept is answered with `405 method_not_allowed` and an `Allow` header that lists the accepted methods. An unknown path is answered with `404 not_found`.

The OpenAPI document describes every operation with its parameters, body, answers and the scope it needs, which also appears as `x-scope`. Like every other endpoint it needs a valid key, so download it before you import it into an OpenAPI tool:

```bash
curl -H "Authorization: Bearer mfd_your_key" -o manifold-openapi.json "https://manifold.example.com/api/v1/openapi.json"
```

### Requests and responses

- Send bodies as JSON with `Content-Type: application/json`. Another content type, or a body that is not valid JSON, is answered with `400 invalid_json`. Only the file upload uses `multipart/form-data`.
- Bodies may have up to 5 MB. Uploads may be as large as the upload limit, see [Files](#files).
- Ids are UUIDs, and times are ISO 8601 in UTC, such as `2026-09-30T08:15:00.000Z`.
- Creating answers `201` with the new record, changing answers `200` with the changed record, and `DELETE` answers `204` without a body.
- A single record is the body itself. Lists wrap their items, see [Paging](#paging).
- JSON answers carry `Cache-Control: no-store`.

## Paging

The lists of services, notes, revisions, map features and vault entries page with a cursor and accept two query parameters:

| Parameter | Meaning                                                                  |
| --------- | ------------------------------------------------------------------------ |
| `limit`   | Items per page, 50 by default and at most 100.                           |
| `cursor`  | The `next_cursor` of the previous page. Leave it out for the first page. |

A page holds `data` and `next_cursor`, which is `null` on the last page:

```json
{
  "data": [
    {
      "id": "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
      "title": "Trip",
      "excerpt": "Ferries leave every hour.",
      "version": 2,
      "updated_at": "2026-09-29T17:42:10.512Z",
      "deleted_at": null
    }
  ],
  "next_cursor": "eyJ1IjoiMjAyNi0wOS0yOVQxNzo0MjoxMC41MTJaIiwiaSI6IjNmMjUwNGUwLTRmODktNDFkMy05YTBjLTAzMDVlODJjMzMwMSJ9"
}
```

Pass cursors back unchanged. A cursor the API did not hand out is answered with `400 invalid_cursor`. The list of map features is a GeoJSON FeatureCollection: its items are in `features`, and `next_cursor` sits next to them.

## Services

A service looks like this; `icon_url` is `null` when the service has no icon, and `position` counts from 0 in sidebar order:

```json
{
  "id": "0f8fad5b-d9cb-469f-a165-70867728950e",
  "alias": "Grafana",
  "url": "https://grafana.example.com",
  "icon_url": "/files/9b2c1f10-58d1-4a7e-9a8c-2a3e3c7f1b11",
  "position": 0
}
```

- `POST /api/v1/services` takes `alias`, up to 60 characters, and `url`, an `http` or `https` address. Any other scheme, such as `javascript:`, is refused with `422 validation_failed`.
- `PATCH /api/v1/services/{id}` takes `alias`, `url` or both. What you leave out stays as it is.
- `PUT /api/v1/services/order` takes `{ "ids": [] }` with every service id exactly once, in the new order, and answers the services in that order as `{ "data": [] }`.
- Icons are uploaded on the Services page, see [Services](services.md). With `files:read`, a key can download the icon from `icon_url`.

## Notes

A note carries its content in two forms: `content` is the TipTap JSON document the editor works with, and `markdown` is the same content as Markdown.

```json
{
  "id": "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
  "title": "Trip",
  "version": 1,
  "created_at": "2026-09-29T17:40:02.118Z",
  "updated_at": "2026-09-29T17:40:02.118Z",
  "deleted_at": null,
  "content": {
    "type": "doc",
    "content": [
      {
        "type": "paragraph",
        "content": [{ "type": "text", "text": "Ferries leave every hour." }]
      }
    ]
  },
  "markdown": "Ferries leave every hour."
}
```

### Reading notes

- `GET /api/v1/notes/{id}` and `GET /api/v1/notes/{id}/revisions/{version}` accept `format`: `json` for `content` only, `markdown` for `markdown` only, or `both`, the default. Writes always answer both.
- Notes in the trash can be read too; their `deleted_at` is set.
- `GET /api/v1/notes` lists notes without their content: `id`, `title`, `excerpt`, `version`, `updated_at` and `deleted_at`. `q`, up to 200 characters, keeps the notes whose title or text match it, and `include_trashed=true` adds the notes in the trash.

### Writing notes

- `POST /api/v1/notes` takes `title`, up to 200 characters, and the content either as `content`, a TipTap JSON document, or as `markdown`, never both. All three are optional.
- Content is checked against the editor's schema. Unknown node or mark types, links other than `http`, `https` and `mailto`, and images that are not files of this Manifold are refused with `422 validation_failed`. Raw HTML in Markdown is dropped. A note's content may have up to 2 MB as TipTap JSON.
- To show an image, [upload it](#files) first and use its `url` in the Markdown, such as `![Floor plan](/files/9b2c1f10-58d1-4a7e-9a8c-2a3e3c7f1b11)`.
- `PATCH /api/v1/notes/{id}` needs `version`, the version you last read, next to the `title`, `content` or `markdown` you change. What you leave out stays as it is. When the stored version differs, the answer is `409 version_conflict` with `current_version`: read the note again, merge your change and send it with that version.
- Every successful change raises `version` by one and adds a revision written by the key, with `actor_type` `api_key` and the key's id as `actor_id`.
- `DELETE /api/v1/notes/{id}` moves the note to the trash, which also hides its map features. `POST /api/v1/notes/{id}/restore` brings it back. A note in the trash cannot be changed until it is restored, and it is deleted for good after `TRASH_RETENTION_DAYS` days, 30 unless changed, see [Configuration](configuration.md).

### Revisions

`GET /api/v1/notes/{id}/revisions` lists a note's revisions, newest first, with `version`, `title`, `actor_type` (`owner`, `api_key` or `system`), `actor_id`, `created_at` and `updated_at`. `POST /api/v1/notes/{id}/revisions/{version}/restore` writes the title and content of that revision as a new version, so the history keeps every step. See [Notes](notes.md) for how revisions work in the app.

## Map features

Map features are GeoJSON Features in EPSG:4326, with positions as `[longitude, latitude]`. Each one belongs to a note:

```json
{
  "type": "Feature",
  "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "geometry": { "type": "Point", "coordinates": [28.97, 41.01] },
  "properties": {
    "note_id": "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    "note_title": "Pier",
    "kind": "point"
  }
}
```

- A geometry is a `Point`, a `LineString` with at least 2 positions, or a `Polygon` whose rings have at least 4 positions and are closed, with the first position repeated at the end. Positions have two numbers within the ranges of longitude and latitude, and a geometry has at most 10,000 of them. Other geometry types are refused with `400 invalid_request`; shapes that cross themselves or rings that are not closed with `422 validation_failed`.
- `GET /api/v1/map/features` lists features oldest first. `bbox=west,south,east,north`, in degrees, keeps the features that intersect the box, and `note_id` keeps the features of one note. Features of notes in the trash are left out.
- `POST /api/v1/map/features` takes a Feature with `geometry` and exactly one of `note_id`, an existing note outside the trash, or `note`, an object with `title` and `content` or `markdown` for a new note that is created in the same request. `properties` is ignored.
- `PATCH /api/v1/map/features/{id}` takes `{ "geometry": {} }` and replaces the geometry. The kind stays: a point stays a point, a line a line and a polygon a polygon. A geometry of another kind is refused with `422 validation_failed`.
- `DELETE /api/v1/map/features/{id}` removes the feature. Its note stays.

Creating a feature together with a new note needs only `map:write`. See [Map Notes](map-notes.md) for the map in the app.

## Basemaps

Basemaps are the tile sources added under **Settings → Map**. The **Standard** basemap from `MAP_TILE_URL` is configuration and not listed; the maps show it while no basemap is `in_use`.

```json
{
  "id": "6f1c1f0e-2d4b-4a51-9a51-3f8f7b2a1c90",
  "name": "Topo",
  "url": "https://{a-c}.tile.example.com/{z}/{x}/{y}.png",
  "attribution": "Example Topo",
  "max_zoom": 17,
  "in_use": true,
  "position": 0
}
```

- `url` is an XYZ template over `https` with `{z}`, `{x}` and `{y}` or `{-y}`; `{a-c}` and `{1-4}` pick a subdomain, and `{s}` is stored as `{a-c}`. Addresses with a user name or password are refused. A refused address answers `422 validation_failed` with the reason under `fields.url`.
- `attribution` is plain text of up to 300 characters, `max_zoom` a whole number from 0 to 22, 19 when left out, and `name` up to 60 characters.
- `POST /api/v1/map/basemaps` adds the basemap at the end without putting it in use.
- `PATCH /api/v1/map/basemaps/{id}` changes the fields it is sent. `in_use: true` puts the basemap in use instead of the one before; `in_use: false` on the basemap in use returns the maps to **Standard**.
- `DELETE /api/v1/map/basemaps/{id}` removes the basemap; when it was in use, the maps go back to **Standard**.

## Vault

`GET /api/v1/vault/secrets` and `GET /api/v1/vault/secrets/{id}` answer the metadata of vault entries: `id`, `name`, `service_url`, `description`, `api_key_id`, `created_at` and `updated_at`. `api_key_id` names the API key an entry is a copy of, and is `null` for every other entry. They never contain the value or its ciphertext, and there is no route that writes to the vault.

## Search

`GET /api/v1/search` searches notes, services and vault entry names at once, with the same ranking as the search in the app:

| Parameter | Meaning                                                                  |
| --------- | ------------------------------------------------------------------------ |
| `q`       | The words to find, up to 200 characters. Required.                       |
| `types`   | Comma-separated types: `note`, `service` or `secret`. All when left out. |
| `limit`   | Hits, 20 by default and at most 50.                                      |

```bash
curl -H "Authorization: Bearer mfd_your_key" "https://manifold.example.com/api/v1/search?q=grafana&types=note,service"
```

```json
{
  "data": [
    {
      "type": "service",
      "id": "0f8fad5b-d9cb-469f-a165-70867728950e",
      "title": "Grafana",
      "snippet": "https://grafana.example.com",
      "link": "https://grafana.example.com",
      "score": 0.9
    }
  ]
}
```

Hits are sorted best first, with a `score` from 0 to 1. `link` is a path in the app for notes (`/notes/{id}`) and vault entries (`/vault`), and the address of the service for services. Types whose read scope the key lacks (`notes:read`, `services:read` or `vault:read`) are left out without an error. See [Search and the command palette](search.md).

## Files

`POST /api/v1/files` uploads one image as `multipart/form-data` in the field `file`:

```json
{
  "id": "9b2c1f10-58d1-4a7e-9a8c-2a3e3c7f1b11",
  "name": "floor-plan.png",
  "mime_type": "image/png",
  "size": 48213,
  "url": "/files/9b2c1f10-58d1-4a7e-9a8c-2a3e3c7f1b11",
  "created_at": "2026-09-30T08:15:00.000Z"
}
```

- Manifold accepts any file and recognizes its type from the content, never from the file name or the type the client sends: PNG, JPEG, WebP, GIF and safe SVG images, PDF, MP3, WAV, OGG, FLAC and M4A audio, MP4, WebM and QuickTime video, and, with a `.txt`, `.log`, `.md`, `.csv` or `.json` name and UTF-8 content, text. Any other file is stored as `application/octet-stream` and always sent as a download. An empty file is refused with `422 file_empty`.
- A file may be as large as `UPLOAD_MAX_BYTES`, 100 MB unless changed, see [Configuration](configuration.md). A larger file is refused with `413 file_too_large`. The upload is written to disk as it arrives, so a large file never sits in memory.
- `GET /api/v1/files/{id}` answers the file with its type, inline for the types above and as a download for any other. It answers a `Range` header with `206` and that part, as players seeking in audio and video ask. The address in `url` works with the same key too, as long as it has `files:read`, and for you in the browser while you are signed in.
- A file that no note and no service refers to is deleted by the daily housekeeping once it is a day old, so use an upload in a note soon after.

## Usage

`GET /api/v1/usage` answers the report of **Settings → Usage**: how many records each module keeps and their size, the uploaded files by owner, the database and its tables, the upload directory with the free space of its disk, and the server process. It is measured for every request. [Usage report](usage.md#through-the-api-and-mcp) shows the answer.

## Errors

Every error has the same shape. `code` is meant for programs, and `message` is English and meant for developers:

```json
{ "error": { "code": "not_found", "message": "Note was not found." } }
```

Some errors add a field:

- `fields` names the invalid parameters or body fields with a message for each, on `invalid_request` and `validation_failed`.
- `current_version` holds the stored version of the note on `version_conflict`.

```json
{
  "error": {
    "code": "validation_failed",
    "message": "The input was not accepted.",
    "fields": { "url": "Enter an address that starts with http:// or https://." }
  }
}
```

| Status | Code                 | Meaning                                                                                    |
| ------ | -------------------- | ------------------------------------------------------------------------------------------ |
| 400    | `invalid_request`    | A parameter or body field is missing or has the wrong form.                                |
| 400    | `invalid_json`       | The body is not valid JSON, or it was not sent as `application/json`.                      |
| 400    | `invalid_cursor`     | The `cursor` was not handed out by the API.                                                |
| 401    | `missing_key`        | The request has no `Authorization: Bearer` header.                                         |
| 401    | `invalid_key`        | The key is unknown, malformed, revoked or expired.                                         |
| 403    | `insufficient_scope` | The key lacks the scope the endpoint needs.                                                |
| 404    | `not_found`          | There is no such endpoint or record.                                                       |
| 405    | `method_not_allowed` | The path does not accept this method. `Allow` lists the methods it accepts.                |
| 409    | `version_conflict`   | The note changed since the `version` you sent.                                             |
| 411    | `length_required`    | A body was sent in chunks without a `Content-Length` header.                               |
| 413    | `payload_too_large`  | The body is larger than 5 MB, or an upload is larger than the upload limit.                |
| 413    | `file_too_large`     | The file is larger than `UPLOAD_MAX_BYTES`.                                                |
| 422    | `validation_failed`  | The input has the right form but was not accepted, such as a geometry that crosses itself. |
| 422    | `file_type`          | The route accepts only some types of file, and this is not one of them.                    |
| 422    | `file_empty`         | The upload is empty.                                                                       |
| 429    | `rate_limited`       | The key used up its requests for the current minute.                                       |
| 500    | `internal_error`     | An unexpected error. It is logged on the server.                                           |

Manifold checks a request in a fixed order and answers the first problem it finds: the path and the method, the key, the rate limit, the scope, the parameters and the body, and finally the operation itself.

## Rate limits

Each key may make `API_RATE_LIMIT_PER_MINUTE` requests per minute, 120 unless changed, see [Configuration](configuration.md). The count is per key and shared by the REST API, the [MCP server](mcp.md) and file downloads from `/files/<id>` with the key. Every answer after the key was accepted reports the state of the current window:

| Header                | Meaning                                         |
| --------------------- | ----------------------------------------------- |
| `RateLimit-Limit`     | Requests allowed per minute for this key.       |
| `RateLimit-Remaining` | Requests left in the current window.            |
| `RateLimit-Reset`     | Seconds until the window ends.                  |
| `Retry-After`         | Only on `429`: seconds to wait before retrying. |

A window starts with the key's first request and lasts one minute. The counters live in the memory of the app, so a restart resets them.

## Audit log

Every successful write through the API is recorded in the audit log under **Settings → Security**, with the key as the actor (shown as **API key**), the action, such as `note.update` or `map_feature.create`, the record it changed, and the client's address and user agent. Reads are not recorded; they only update the key's last use. See [Your account](account.md).

## Examples

The examples read the address of your Manifold and a key from two shell variables:

```bash
export MANIFOLD_URL="https://manifold.example.com"
export MANIFOLD_KEY="mfd_your_key"
```

List the notes that match a word, 20 at a time:

```bash
curl -H "Authorization: Bearer $MANIFOLD_KEY" "$MANIFOLD_URL/api/v1/notes?limit=20&q=ferry"
```

Create a note from Markdown. The answer is the new note with `version` 1:

```bash
curl -X POST "$MANIFOLD_URL/api/v1/notes" \
  -H "Authorization: Bearer $MANIFOLD_KEY" \
  -H "Content-Type: application/json" \
  --data '{"title": "Trip", "markdown": "# Ferry\n\n- 08:30 from the pier\n- Tickets on board"}'
```

Change the note, naming the version it is based on:

```bash
curl -X PATCH "$MANIFOLD_URL/api/v1/notes/3f2504e0-4f89-41d3-9a0c-0305e82c3301" \
  -H "Authorization: Bearer $MANIFOLD_KEY" \
  -H "Content-Type: application/json" \
  --data '{"version": 1, "markdown": "# Ferry\n\n- 08:30 and 09:30 from the pier"}'
```

If the note changed in the meantime, the answer is `409`:

```json
{
  "error": {
    "code": "version_conflict",
    "message": "The record changed since that version.",
    "current_version": 2
  }
}
```

Upload an image and use the `url` of the answer in a note:

```bash
curl -X POST "$MANIFOLD_URL/api/v1/files" \
  -H "Authorization: Bearer $MANIFOLD_KEY" \
  -F "file=@floor-plan.png"
```

Place a pin on the map together with a new note:

```bash
curl -X POST "$MANIFOLD_URL/api/v1/map/features" \
  -H "Authorization: Bearer $MANIFOLD_KEY" \
  -H "Content-Type: application/json" \
  --data '{"type": "Feature", "geometry": {"type": "Point", "coordinates": [28.97, 41.01]}, "note": {"title": "Pier", "markdown": "Ferries every hour."}}'
```

To link the pin to a note that exists, send `"note_id": "3f2504e0-4f89-41d3-9a0c-0305e82c3301"` instead of `note`.

## Example: fetching every note

```js
const base = 'https://manifold.example.com/api/v1';
const headers = { Authorization: `Bearer ${process.env.MANIFOLD_KEY}` };

async function fetchAllNotes() {
  const notes = [];
  let cursor = null;

  do {
    const url = new URL(`${base}/notes`);
    url.searchParams.set('limit', '100');

    if (cursor !== null) {
      url.searchParams.set('cursor', cursor);
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(`The API answered ${response.status}`);
    }

    const body = await response.json();

    notes.push(...body.data);
    cursor = body.next_cursor;
  } while (cursor !== null);

  return notes;
}
```
