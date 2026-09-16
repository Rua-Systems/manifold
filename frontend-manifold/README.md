# frontend-manifold

Angular frontend of Project Manifold. The framework-level conventions come from the agent rule set (GENERAL-RULES, GIT-RULES, ANGULAR). This file records the per-project decisions those rules leave open.

## Project Settings

| Setting | Decision |
| --- | --- |
| Package manager | npm |
| Angular | Latest stable (currently 22.x). Standalone components, `inject()`, built-in control flow |
| Styling | SCSS, no UI library. Design tokens are CSS custom properties defined once in `src/styles/_theme.scss` for both light and dark themes |
| State | RxJS services (`BehaviorSubject` exposed as `Observable`). Signals are not used and the signal APIs are blocked by ESLint |
| Change detection | `OnPush` everywhere, enforced by ESLint and by the component schematic defaults |
| Routing | Path location, lazy loading with `loadComponent` |
| i18n | `@ngx-translate/core` with JSON files in `public/i18n/`. Languages: `en`, `tr`. Default and fallback: `en` |
| Tests | No `*.spec.ts` files are created. The schematics are configured with `skipTests` |
| Formatting | Prettier: tabs (width 4), single quotes, print width 100. JSON files use 2 spaces because npm and the Angular CLI rewrite them. SCSS is excluded from Prettier so `>.className` selectors keep the project style |
| Lint thresholds | 150 lines per function, 400 lines per file, no `console.log`, no ternary operator, no `any`, strict equality |

## Commands

```bash
npm install
npm start
npm run build
npm run lint
npm run format
```

## Structure

```text
src/
  app/
    core/
      classes/          framework-agnostic helpers
      constants/        default values and constant data sets
      directives/       one directive per file
      enums/            shared enums
      guards/           functional route guards
      interceptors/     functional HTTP interceptors
      interfaces/       TypeScript models grouped per domain
      pipes/            one pipe per file
      resolvers/        functional resolvers
      types/            shared type aliases
    pages/              routed feature components, nested like the routes
    services/
      api/              HTTP access
      state/            application state (theme, language)
    shared/
      components/       reusable UI used across pages
    app.component.*     application shell
    app.config.ts       application-wide providers
    app.routes.ts       route table
  environments/         environment.ts (production, default) and environment.development.ts
  styles/               theme tokens
  styles.scss           global styles only
public/
  i18n/                 one translation file per language
```

## Naming

- Angular file suffixes are kept: `*.component.ts`, `*.service.ts`, `*.guard.ts`, `*.interceptor.ts`, `*.pipe.ts`, `*.resolver.ts`, `*.directive.ts`. The schematics in `angular.json` are configured so `ng generate` produces them.
- Selectors use the `app` prefix. Components are element selectors in kebab-case, directives are attribute selectors in camelCase.
- CSS custom properties are kebab-case (`--text-primary`). SCSS variables and mixins are camelCase (`$colorTextDark`, `lightTokens`).

## Environments

`environment.ts` is the production default. The `development` build configuration swaps it with `environment.development.ts` through `fileReplacements`. Both files implement the `Environment` interface, so a key added to one must be added to the other. Import only `environments/environment`, never the development file.

## Theming

Tokens live in `src/styles/_theme.scss` and are applied on `:root`. The active theme is set as `data-theme` on `<html>` by `ThemeService`, which reads the stored preference first and falls back to `prefers-color-scheme`. Components reference tokens only and never hardcode colors.

## Internationalization

All user-facing text goes through the `translate` pipe with namespaced keys. Every key must exist in every file under `public/i18n/`. `LanguageService` resolves the initial language from storage, then the browser language, then the default, and keeps `<html lang>` in sync.
