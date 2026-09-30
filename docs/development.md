# Development

This page is for people who work on the code of Manifold: setting up a checkout, the structure of the project, the database, tests and conventions. Before you open a pull request, also read `CONTRIBUTING.md` in the repository.

## Setting up

Requirements: Node.js 24 with npm, Docker with Compose for the development database, and Git.

```bash
git clone https://github.com/justhasanuknow/manifold.git
cd manifold
npm ci
cp .env.example .env
```

Fill in `.env` for your machine: `BETTER_AUTH_SECRET` and `ENCRYPTION_KEY` (each from `openssl rand -base64 32`) and `OWNER_PASSWORD`. Keep `ORIGIN=http://localhost:5173` and the `DATABASE_URL` that points at `localhost:5432` with the `POSTGRES_*` credentials. Then start the database and the development server:

```bash
npm run db:up
```

```bash
npm run dev
```

`npm run db:up` starts PostGIS 17 from `docker-compose.dev.yml` on `127.0.0.1:5432`, with a second database, `manifold_test`, for the tests. Open `http://localhost:5173/login` and sign in as the owner. Like the production server, the development server applies the migrations and creates the owner on the first start. Without `SMTP_HOST`, mails are printed to the console. Uploaded files go to the git-ignored `.data/` folder.

`allowScripts` in `package.json` lists the dependencies that may run install scripts. When a new dependency needs one, add it there with its exact version.

## Commands

| Command             | Purpose                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------ |
| `npm run dev`       | Development server with hot reload at `http://localhost:5173`.                             |
| `npm run build`     | Production build into `build/`, and the command line into `build-cli/cli.js`.              |
| `npm run check`     | Type-checks the project with `svelte-check`, failing on warnings too.                      |
| `npm run lint`      | Prettier, ESLint and markdownlint, without changing files.                                 |
| `npm run format`    | Formats every file with Prettier.                                                          |
| `npm run test:unit` | Unit tests in watch mode. Add `-- --run` for a single run.                                 |
| `npm run test:int`  | Integration tests against `manifold_test`.                                                 |
| `npm run test:e2e`  | Builds the app and runs the Playwright tests against it, on a desktop and a phone profile. |
| `npm test`          | Unit, integration and end-to-end tests once.                                               |
| `npm run cli`       | Runs the built command line with `.env`, for example `npm run cli -- owner:show`.          |
| `npm run db:up`     | Starts the development database.                                                           |
| `npm run db:down`   | Stops it and keeps its data.                                                               |
| `npm run db:reset`  | Deletes the development database and starts a fresh one, after asking.                     |
| `npm run db:studio` | Opens Drizzle Studio on the development database.                                          |
| `npm run sbom`      | Prints the CycloneDX software bill of materials of the production dependencies.            |

`npm run check` needs the compiled messages in `src/lib/paraglide`, which `npm run dev` and `npm run build` generate. Run one of them first in a fresh checkout.

## Project structure

```text
src/
  hooks.server.ts          startup and the request pipeline: sessions, origin check, body limits, headers
  routes/
    (app)/                 signed-in pages: services, notes, map, vault, search, settings, step-up
    login/                 sign-in, forgot-password/ and logout/
    api/v1/                the REST API, one route that hands every request to the router
    mcp/                   the MCP server
    files/                 uploaded files
    healthz/               the health check
  lib/
    modules/               one folder per module, the registry and the scopes
    server/                server-only core: auth, security, audit, files, search, api/, mcp/, backup/, db/
    components/            shared Svelte components; edra/ holds the editor bindings
    state/                 shared client state in runes
    schemas/               Zod schemas shared by forms and the server
    types/, utils/         shared types and helpers
  styles/                  SCSS partials: colors, themes, forms, variables
scripts/
  cli.ts                   the command line, bundled into cli.js
  db-reset.ts              npm run db:reset
migrations/                hand-written SQL migrations
messages/                  interface texts per locale
tests/
  integration/             setup for the integration tests
  e2e/                     Playwright tests
  support/                 the test database, the test owner and the test environment
docker/                    the container health check and the development database setup
docs/                      this documentation
```

The app's own pages talk to the server through `load` functions and form actions. `+server.ts` endpoints exist only for outside callers: `/api/v1`, `/mcp`, `/healthz`, `/files/<id>` and the export download. Widgets that save or read on their own, such as the note editor, the map and the command palette, call form actions with `fetch` and `deserialize`.

Better Auth runs only on the server. Its HTTP handler is not mounted; pages call `auth.api.*` from form actions and hooks.

## Startup

On every start, `hooks.server.ts` validates the environment (`src/lib/server/env.ts`), applies pending migrations under an advisory lock, creates the owner when no user exists, and starts the daily housekeeping. A missing or malformed variable stops the start with a message that names it.

## Modules

Every feature is a module under `src/lib/modules/<id>/`: `services`, `notes` (with Map Notes in `notes/map/`) and `vault`. The core lives in `src/lib/server/`, `src/lib/components/` and `src/routes/`.

A module has two manifests:

- `manifest.ts` is safe for the browser: `id`, `label`, `icon`, `href`, the sidebar `position` and kind (`link` or `group`), its API `scopes` and optional palette `commands`.
- `manifest.server.ts` holds the server half: the sidebar group contents, the file references that keep uploads alive, housekeeping tasks, API routes, MCP tools and the search provider.

The sidebar, the command palette, the scope list, the OpenAPI document, the API router, the MCP tools and the search are all built from the registry in `src/lib/modules/registry.ts` and `registry.server.ts`. Adding a module never touches them.

### Adding a module

1. **Folder:** create `src/lib/modules/<id>/` with the server code (`*.server.ts`), Zod schemas, types, components, API routes and MCP tools. Route files under `src/routes/` stay thin and re-export the module's loads and actions.
2. **Manifests:** write `manifest.ts` and `manifest.server.ts`. A sidebar group can hand its filter to the search with `filterable` items, `filterLabel` and `filterSearch`.
3. **Registry:** add the manifest to `registry.ts` and the server half to `registry.server.ts`. A unit test checks that both list the same modules.
4. **Migration:** add `NNNN_<id>_<description>.sql`, see [Database and migrations](#database-and-migrations).
5. **Scopes:** `<id>:read` and `<id>:write`, labeled with messages. A write scope does not include the read scope.
6. **API:** declare routes with `defineRoute` from `src/lib/server/api/types.ts`: method, OpenAPI-style path, scope, Zod schemas for the parameters, the query and the body, the response schema, and an `audit` action for writes. The router checks scopes and validates input. An integration test checks that every route refuses a key without its scope and appears in the OpenAPI document.
7. **MCP:** declare tools with `defineTool` from `src/lib/server/mcp/types.ts`, usually running the module's API handlers through `callRoute`. Describe them for AI agents and name the scope they need.
8. **Search:** a provider with a `type`, the read `scope` and a `search(query, limit)` that answers hits scored from 0 to 1.
9. **Messages:** add every text to `messages/en.json` and `messages/tr.json`.

## Database and migrations

Manifold uses PostgreSQL 17 with PostGIS through Drizzle ORM on postgres.js. Migrations are hand-written SQL in `migrations/`, applied in order on start and by `node cli.js migrate`, each in its own transaction under an advisory lock, and recorded with a checksum in `schema_migrations`.

To change the schema:

1. Add `NNNN_<module-or-core>_<description>.sql` with the next number, for example `0012_notes_tags.sql`. The middle part is the module id, or `core`.
2. Follow the table conventions: `uuid` primary keys with `DEFAULT gen_random_uuid()`, `timestamptz` columns, `created_at` and `updated_at`, snake_case names, explicit foreign keys with a chosen `ON DELETE`, and an index for every foreign key and every column used to filter or sort.
3. Mirror the tables by hand in the module's `schema.server.ts`, or in `src/lib/server/db/*-schema.ts` for the core. PostGIS columns use the custom type in `src/lib/server/db/geometry.ts`.

Never change a migration that ran anywhere: the checksum check stops the app. Add a new one instead.

## Interface languages

The interface texts are in `messages/en.json` and `messages/tr.json`, with English as the base, and the keys of both files are sorted. Paraglide compiles them into functions:

```svelte
<script lang="ts">
  import { m } from '$lib/paraglide/messages.js';
</script>

<h1>{m.data_title()}</h1>
```

Every text a user can see goes through a message, and every key exists in both files. URLs carry the locale as a prefix except for English, the default: `/login` and `/tr/login`.

## Tests

Unit tests use Vitest and live next to the code as `*.test.ts`. Integration tests are `*.int.test.ts`: before each run they reset and migrate `manifold_test`, seed the test owner, and run one file after another; tests that need their own tables use an isolated schema.

```bash
npm run test:unit -- --run
```

```bash
npm run test:int
```

End-to-end tests use Playwright and live in `tests/e2e`. The configuration builds the app, resets `manifold_test` and starts the production server (`node build`) on `http://localhost:4173`, then runs every test on a desktop and a phone profile. Every test sends its own `X-Forwarded-For` address, so the sign-in rate limit counts each test separately. Map tiles are answered locally.

```bash
npm run test:e2e
```

The tests never read `DATABASE_URL`: they build the address of `manifold_test` from the `POSTGRES_*` variables, so they cannot reach your development database or a remote one. Every test must make at least one assertion. Scope and permission-sensitive behavior needs tests for the allowed and the refused case.

## Conventions

- Code, commit messages and documentation are written in English.
- TypeScript runs in strict mode. `any` is not used, and if and else are written out instead of the conditional operator, except for inline values in Svelte templates.
- Comments explain why, never what: the reason behind a decision that is not obvious, a workaround and what it works around, and documentation comments on exported functions, types and components.
- Prettier formats everything, with tabs. Run `npm run format` instead of formatting by hand.
- Messages never shift the layout: anything that appears and disappears, such as field errors and form notices, renders into space reserved in advance. The `fieldError` and `formNotice` mixins in `src/styles/_forms.scss` do this for forms.
- The visual language uses typographic devices such as `++ Ident Verification ++` sigils, record-style labels and corner marks.
- The product and developer names are constants in `src/lib/constants.ts`; the name of the instance comes from `ORGANIZATION_NAME`.
- Commits are focused and their subjects use the imperative mood, for example "Add note templates".

## Writing documentation

The pages in `docs/` are plain Markdown for GitHub.

- Link to other pages by file name, such as `[Backups](backups.md)`.
- Use sentence-case headings, bold for interface labels and arrows for paths in the interface, such as **Settings → Security**.
- markdownlint checks the files as part of `npm run lint`.
- Record choices that someone could reasonably have made differently in [Decisions](decisions.md), with the reason.

## Continuous integration

`.github/workflows/ci.yml` runs on pushes to `main` and on pull requests:

- `verify`: `npm audit` for known vulnerabilities, lint, the build, the type check, unit tests, integration tests against the development database and the Playwright tests;
- `docker`: builds the image, starts it with the database from empty volumes and checks the health endpoint, the sign-in page, a backup, the unprivileged user, the read-only root filesystem and the software bill of materials.

Dependabot proposes updates for npm packages, GitHub Actions and the Docker base image every week.

## Releasing

1. Open a pull request that sets the new version with `npm version <version> --no-git-tag-version`, adds its section to `CHANGELOG.md`, and updates the version in the examples of `docs/installation.md` and `docs/deployment.md`.
2. Merge it once continuous integration passes.
3. Publish a GitHub release with the tag `v<version>` on the merge commit and the notes from the changelog.

Publishing the release starts `.github/workflows/release.yml`. It builds the image from the tagged commit for `linux/amd64` and `linux/arm64`, each on a native runner of its architecture, combines both into one multi-platform image, pushes it to `ghcr.io/<owner>/manifold` as `<version>`, `<major>.<minor>` and `latest`, and attaches a signed build provenance attestation. Its last job calls the Coolify deploy webhook when the repository secrets `COOLIFY_WEBHOOK` and `COOLIFY_TOKEN` are set, see [Deployment](deployment.md). To build the image of an existing tag again, run the workflow by hand under **Actions → Release image** with that tag.

## Branch rules

`.github/rulesets/` holds the rules for `main` as GitHub ruleset files:

- `main-protection.json` applies to everybody: changes arrive only through squash-merged pull requests, `verify` and `docker` must pass, review threads must be resolved, and force pushes and deleting the branch are blocked.
- `main-review.json` also requires an approving review from a code owner, listed in `.github/CODEOWNERS`. Repository admins may skip only this rule when they merge a pull request, because nobody can approve their own pull request.

GitHub enforces rulesets on public repositories and on private repositories of paid plans. Apply them once with the GitHub CLI:

```bash
gh api -X POST repos/{owner}/{repo}/rulesets --input .github/rulesets/main-protection.json
```

```bash
gh api -X POST repos/{owner}/{repo}/rulesets --input .github/rulesets/main-review.json
```

To change a rule later, edit the file and update the ruleset under **Settings → Rules → Rulesets**, or with `gh api -X PUT repos/{owner}/{repo}/rulesets/<id> --input <file>`.
