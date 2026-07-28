# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- changed npm publishing to authenticate with OIDC trusted publishing instead of an `NPM_TOKEN` secret, so no long-lived publish credential exists in the repository at all; npm revoked classic tokens in December 2025 and 2FA-bypass tokens lose the ability to publish around January 2027, so token-based automation had no future
- changed the publish job to Node 22 and pinned npm to 11.18.0; the OIDC exchange needs npm 11.5.1 or newer and Node 22 bundles npm 10, so the pin is a deliberate choice above that floor rather than the floor itself

### Removed

- removed the dependency cache from the publish job, so a poisoned cache entry cannot reach the published tarball

### Fixed

- fixed the `npm trust github` invocation documented in `CLAUDE.md`, which exited with a usage error: the workflow is named with `--file` rather than `--workflow`, and `--allow-publish` has to be passed or the trust entry is created without the permission CI needs
- fixed the claim that npm requires a package to exist before accepting a trust entry; npm accepts one for a name that has never been published and the first CI run creates the package, so the manual bootstrap publish that section described was unnecessary — and impossible as written, since `npm publish --provenance` only generates provenance inside CI
- fixed the release notes to record that a tag push runs the workflow file as it exists at that tag, so a tag cut before a change to `.github/workflows/default.yaml` keeps running the old job and re-pushing it cannot pick the change up

## [1.0.0] - 2026-07-28

### Added

- added `npmMinimalAgeGate: '7d'` to `.yarnrc.yml` so a compromised release has a week to be caught before it can be resolved into this repository
- added `resolutions` pinning the transitive build-tooling dependencies that carry published advisories (`brace-expansion`, `tar`, `fast-uri`, `adm-zip`, `prismjs`) to their first patched release
- added a `delivery > publish:npm` job to `.github/workflows/default.yaml` that publishes the package automatically when a version bump lands on `main`, gated on the same condition the shared workflow uses to cut the tag; it publishes with `npm publish --provenance` and no-ops when the version is already on the registry, so the tag-push recovery path stays safe to re-run
- added a documented `.trivyignore` entry for `CVE-2026-41907` in `uuid` `3.4.0`, which reaches the tree only through `@material-table/core` and cannot be upgraded because that package calls the default export uuid removed in `7.0.0`
- added a theme toggle backed by Backstage's `appThemeApi`, keeping the plugin in sync with the app's theme picker
- added administrator-managed settings — `platform`, `organization`, `refreshIntervalMs` and the Sonar flavour pinned in `app-config.yaml` override user settings and render read-only, with an explanatory note on each affected card
- added an `/alpha` entry point exporting the plugin for Backstage's declarative frontend system, so apps built on `@backstage/frontend-defaults` can list it in `features` like any other plugin; the page mounts through `compatWrapper` and the route through `convertLegacyRouteRef`, matching how the community plugins bridge the two systems
- added Backstage plugin scaffolding: `codeHealthPlugin`, the routable `CodeHealthPage` extension, `rootRouteRef` with `contributors` and `settings` sub-routes, and a `config.d.ts` schema for the `codeHealth` key
- added Backstage proxy support: configuring `proxyPath` for GitHub, Azure DevOps, Sonar or WakaTime routes those calls through the Backstage backend, which attaches the credential, so no token reaches the browser
- added documented `.trivyignore` entries for `CVE-2025-25288`, `CVE-2025-25289` and `CVE-2025-25290` in the `@octokit` packages that `@backstage/core-compat-api` pulls in transitively; `@backstage/integration` still pins the affected octokit majors in its latest release, so there is nothing to upgrade to
- added four Backstage utility APIs (`codeHealthAuthApiRef`, `codeHealthConfigApiRef`, `codeHealthRepositoriesApiRef`, `codeHealthContributorsApiRef`) so an integrator can swap any of them for their own implementation

### Changed

- **BREAKING CHANGE:** converted the project from a standalone GitHub Pages single-page app into the publishable Backstage frontend plugin `@rios0rios0/backstage-plugin-code-health`; `yarn build` now emits a library in `dist/` instead of a deployable site, and the GitHub Pages deployment job was removed
- **BREAKING CHANGE:** downgraded React from `19` to `18` and added `react-router-dom` `v6`, matching the peer ranges of `@backstage/core-plugin-api` and `@backstage/core-components`
- **BREAKING CHANGE:** narrowed `DashboardService` and `ContributorService` to take no credentials — tokens and the target organization are now resolved internally from app-config and user settings; the platform-specific implementations moved behind `PlatformDashboardService` and `PlatformContributorService`
- **BREAKING CHANGE:** renamed the project from `gitforge-dashboard` to `code-health` — the repository, the npm package (`@rios0rios0/backstage-plugin-code-health`), the plugin id, the `codeHealth` app-config key, the browser storage keys and every exported symbol. "Forge" named the systems the plugin reads from rather than what it tells you about them
- **BREAKING CHANGE:** replaced Tailwind CSS with Material UI `v4` and `@backstage/core-components` so the dashboard inherits the host app's theme; `Page`, `Header` and `TabbedLayout` now provide the navigation that the custom `Navigation` component used to
- **BREAKING CHANGE:** replaced the Vite/Vitest toolchain with the Backstage CLI — `backstage-cli package build` (plus `tsc` for the declarations it consumes), `package lint` and `package test`; the suite now runs on Jest and the package publishes the standard `dist/index.esm.js` + `dist/index.d.ts` layout through `publishConfig`
- changed every HTTP client to go through Backstage's `fetchApi` and a proxy-aware `EndpointResolver` instead of calling `fetch` with hard-coded base URLs, and repositories now receive their client through the constructor
- changed the credential store to initialize lazily behind `DeferredAuthenticationService`, so the encrypted store can be exposed as a synchronous Backstage utility API and a failing key store degrades to the setup screen instead of breaking the app
- changed the two reusable Claude workflows to pass `CLAUDE_CODE_OAUTH_TOKEN` explicitly instead of `secrets: inherit`, so they no longer receive every repository secret

### Removed

- removed `vite`, `vitest`, `@vitejs/plugin-react`, `@vitest/coverage-v8`, `jsdom` and the standalone ESLint 9 flat config, all superseded by the Backstage CLI
- removed the standalone app entry points (`index.html`, `src/main/main.tsx`, `src/main/app.tsx`, `src/index.css`) and the `Navigation`, `DashboardHeader` and `LoginPage` components they carried
- removed the Tailwind toolchain (`tailwindcss`, `@tailwindcss/vite`)

## [0.2.2] - 2026-05-08

### Added

- added `knip.json` with `ignoreExportsUsedInFile: true` so types exported only for same-file consumption (e.g. `CIFilter`, `ReleaseFilter`, `GraphQLResponse`, `AdoPullRequestIdentity`, `AdoPullRequestReviewer`) are not falsely reported as unused

### Changed

- refreshed `CLAUDE.md` to fix pipeline reference from `yarn.yaml` to `yarn-library.yaml` in Deployment section

### Removed

- removed unused `EMPTY_SONAR_METRICS` constant from `src/domain/entities/sonar_metrics.ts` (flagged by `quality:knip`)
- removed unused `GraphQLContributorQueryResponse` interface from `src/service/mappers/graphql_contributor_node.ts` (flagged by `quality:knip`)

## [0.2.1] - 2026-04-28

### Changed

- refreshed `.github/copilot-instructions.md` to fix `npm` → `yarn` commands, replace outdated file tree with high-level architecture, and update platform/integration descriptions
- refreshed `CLAUDE.md` to document Azure DevOps support, encrypted auth, and new key files

## [0.2.0] - 2026-03-22

### Added

- added `ComplianceBadge` component with hover tooltip showing individual compliance check results
- added `ComplianceRepository` contract with GitHub GraphQL and Azure DevOps REST implementations
- added `IntegrationCard` reusable component for displaying integration connection status
- added ADO REST API client and repository/contributor implementations with batched parallel fetching
- added Azure DevOps support via Adapter Design Pattern (repositories, CI status, tags, contributors)
- added Badges column to repository table that checks each repo's `README.md` for required shields.io badges (Release, License, Build Status, SonarCloud Coverage, SonarCloud Quality Gate, OpenSSF Best Practices) with green/yellow status and click-to-popup details
- added Compliance column to repository table with color-coded status (green/yellow/red) based on pipeline existence, build policies, and branch protection
- added comprehensive test suite (23 new test files, 3 test doubles) covering infrastructure repositories, HTTP clients, hooks, components, pages, and factories
- added contributors metrics dashboard with SonarCloud integration and proportional metric distribution
- added individual disconnect for optional integrations (Sonar, WakaTime) without full logout
- added JUnit test reporter and coverage PR comment via shared pipeline integration
- added mapper tests for ADO repository and contributor mappers
- added optional SonarCloud token prompt on the login page with skip support
- added optional SonarQube job to shared GitHub Actions JavaScript pipeline
- added platform selector on the login page (GitHub or Azure DevOps)
- added service-layer tests for `GitHubContributorService` covering aggregation, distribution, and error scenarios
- added Settings page with per-integration token management for VCS, Sonar, and WakaTime
- added V8 coverage thresholds in `vite.config.ts` enforcing 80%+ statements/functions/lines and 75%+ branches
- added Web Crypto AES-GCM encryption layer for token storage in `localStorage`

### Changed

- changed approved PR counting to use only APPROVED review state instead of merged state fallback
- changed CI workflow to follow the standard `default.yaml` pattern with named workflow, permission comments, and `default` job name
- changed CI workflow to use the new `yarn.yaml` reusable workflow from `rios0rios0/pipelines` (replacing deprecated `javascript.yaml`)
- changed coverage thresholds from 80/80/75/80 to 90/90/77/90 (lines/functions/branches/statements) in `vite.config.ts`
- changed DI wiring to create repositories and services dynamically based on selected platform
- changed sortable table headers to use `<button>` with `aria-sort` for keyboard and screen-reader accessibility

### Fixed

- fixed `lastFetchedAt` and `isLoading` state in App to properly reflect navigation refresh status
- fixed `LoadingSkeleton` column count mismatch (13 vs 12 table headers)
- fixed `onRefetchRef` side effect during render phase by moving it to `useEffect`
- fixed `SonarCloudRepositoryImpl` and `NoOpSonarCloudRepository` method signatures to match interface contract
- fixed TypeScript circular type inference in contributor repository GraphQL pagination loop

## [0.1.0] - 2026-03-12

### Added

- added 5-layer Clean Architecture structure (Domain, Service, Infrastructure, Presentation, Main)
- added `CODE_OF_CONDUCT.md` (Contributor Covenant v2.0)
- added auto-refresh with configurable polling interval
- added branch protection rules, repository ruleset, and copilot environment on GitHub
- added CI pipeline with GitHub Actions and GitHub Pages deployment
- added dashboard with filterable, sortable repository grid
- added GitHub GraphQL API integration for bulk-fetching repository CI status, releases, and tags
- added initial project scaffolding with Vite, React, TypeScript, and TailwindCSS
- added MIT `LICENSE` file
- added PR template directory with default and bump templates
- added runtime PAT authentication with localStorage persistence

### Changed

- changed `README.md` to be illustrative with feature table, architecture tree, security section, and development guide
- changed CI pipeline reference from feature branch back to `@main` after upstream pipeline fix was merged

### Fixed

- fixed `hasWorkflows` incorrectly returning `true` for repos without a default branch ref
- fixed `refetch` type mismatch in `useRepositories` hook (was `void`, now `Promise<void>`)
- fixed CI pipeline failure caused by missing `@testing-library/dom` peer dependency and `@vitest/coverage-v8` for coverage
- fixed CI pipeline to use Yarn Berry (v4.12.0) via corepack after upstream pipeline fix, replacing the Yarn 1 workaround
- fixed Clean Architecture layer violation where service mapper imported from infrastructure
- fixed missing `aria-label` on search input in filter bar for screen reader accessibility
- fixed unnecessary `useMemo` wrapping a constant `null` in the app root component

