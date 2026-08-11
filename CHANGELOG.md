# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.2.0] - 2026-08-11

### Added

- added `technicalDebtMinutes` to `SonarMetrics`, carrying `sqale_index` as SonarQube reports it alongside the formatted `technicalDebt` string. The formatting is lossy — it drops the residual minutes once there are whole days — so summing two debts cannot work backwards from the display value
- moved `formatDebt` into `@rios0rios0/backstage-plugin-code-health-common` and exported it. The collector and the contributor aggregation now format the same value with one implementation instead of two that would drift

### Fixed

- counts sum, because a contributor spanning three repositories carries all three. Percentages average, because adding coverage figures is meaningless. The quality gate takes the worst value present, so one failing repository stays visible instead of being averaged away. A contributor whose repositories have no Sonar project still reports `null` rather than a row of zeroes
- fixed the contributors view rendering its Sonar columns permanently empty. `ListContributorSummaries` hard-coded `sonarMetrics: null`, so `BUGS`, `SMELLS`, `HOTSPOTS`, `VULNS`, `COVERAGE`, `DUPS` and `DEBT` were shown for every contributor and could never hold a value. They now carry the Sonar health of the repositories that contributor touched inside the window
- this is deliberately not an attribution. SonarQube measures projects, not people, and nothing here claims the bugs belong to anyone — two people working the same repository see the same figures. It answers "what does the code this person worked on look like", which is the only honest reading of a per-project measure on a per-person row

## [2.1.0] - 2026-08-11

### Added

- added a log line reporting how many entities collapsed onto a repository another entity already named, pluralised for the single-entity case. Without it the only symptom is a dashboard with repeated rows and nothing anywhere explaining why

### Fixed

- fixed one repository being tracked once per catalog entity that names it, which rendered an identical dashboard row per entity and made every scheduled task re-fetch that repository once per row. Two shapes hit this: a monorepo declaring one component per module, and a single location file declaring many components, since all of them inherit the same `backstage.io/managed-by-location`. Discovery already intended to collapse them — the guard and its comment were there — but it deduplicated on `TrackedRepository.id`, which is a hash of the entity reference and therefore unique per entity by construction, so the check compared entities to themselves and could only ever collapse an entity duplicated within a single pass. Deduplication now keys on the repository's own coordinates via a new `repositoryIdentity()`, folding case because both providers treat those segments case-insensitively and the same repository reached through an annotation and through a source location can differ only in spelling
- fixed the entity owning a shared repository being able to change under the tracked row, which would have taken the dashboard's history with it. `syncRepositories` keys on `id` alone and `id` derives from the entity reference, so any change of winner inserts a new row and soft-deletes the old one, resetting the backfill cursor. The entity already tracking a repository now keeps it whatever its reference, so adding a component later cannot take the repository from the one that has been ingesting it; the lowest reference decides only when no candidate is the incumbent — a first discovery, or the incumbent leaving the catalog — which keeps that choice independent of the order `CatalogReader.listEntities` happened to return
- fixed the existing regression test passing for the wrong reason: it built both fixtures with the same `metadata.name`, so they were one entity rather than two naming one repository, and it exercised the identity collapse that `EntityBuilder`'s own documentation warns about. It is replaced by cases that fail against the previous implementation — two components on a monorepo, several components on one Azure DevOps repository, one repository reached through two different annotations, and a repository staying with its incumbent when a lower-referenced component appears later

## [2.0.0] - 2026-08-10

### Added

- added `.autobump.yaml`, so a release writes the new version to the three published packages and not only to the private workspace root. AutoBump's TypeScript defaults know one `package.json`; in a workspace that is the one file npm never sees, and `delivery-publish` compares the release tag against each published package's own `version`, so a bump that missed them would have failed the guard three times over
- added `@rios0rios0/backstage-plugin-code-health-backend`, the plugin that turns Code Health from a browser-side dashboard into a proper Backstage plugin. It owns a database, a scheduler and the credentials, so the browser stops talking to version control providers entirely. This first piece brings the schema, the store, the health route and the repository discovery task
- added `@rios0rios0/backstage-plugin-code-health-common`, the package that will carry the HTTP contract between the frontend and the incoming backend plugin. It owns the types both sides exchange, plus the pure helpers that derive presentation state from them — `computeComplianceColor`, `computeBadgeColor`, `parseBadgesFromReadme` and `formatDuration` all moved there rather than being duplicated. Having one package own the contract is what stops the client and the server drifting apart, which is the failure mode a hand-synchronised copy in each package eventually reaches
- added `freshUntil` to the coverage response: the instant _every_ tracked repository has data through, rather than the point the luckiest one reached
- added a hand-rolled in-memory IndexedDB double (`test/doubles/stub_indexed_db.ts`), since jsdom ships none and the key store is the one place a lost key silently invalidates every stored credential. It keeps the real `CryptoKey` across opens, so a test can prove a token encrypted before a reload still decrypts after one
- added a rate-limit-aware provider gateway that every request now passes through. It caps concurrency per host and total requests per run, retries `429` and `5xx` with jittered exponential backoff, and opens a circuit breaker on a host that keeps failing. Most importantly it reads `Retry-After` and the `X-RateLimit-*` headers on **every** response rather than only on errors: Azure DevOps applies throttling as latency on a successful `200` and sends those headers _before_ it starts delaying, so a client that inspects them only on failure misses the entire warning and keeps pushing until it is blocked outright. That is what produced the throttling and `5xx` this release exists to fix
- added a time range picker bounded by what the backend has actually ingested, alongside a backfill progress bar. Without them a freshly installed plugin looks broken: it can only answer for the last day, and nothing on screen distinguishes that from a failure
- added activity aggregation over the stored events rather than over a pre-aggregated table, so a change of definition — counting a partially-succeeded build as a success, say — reinterprets the whole history instead of only what is ingested afterwards
- added an operations section to the README covering the three scheduled tasks, the scheduler's own control plane for triggering them, and how long a first backfill actually takes at the default budget — roughly four days for five hundred repositories, or under a day with `backfillChunk: P7D`
- added collectors for Azure DevOps and GitHub that read a date-bounded window in a fixed number of requests. They authenticate through the host application's existing `integrations` configuration, so the Azure DevOps token is no longer duplicated anywhere. Two API defaults are overridden explicitly because both hide most of the data: Azure DevOps returns only _active_ pull requests filtered on _creation_ time, and its build query applies the time window to whichever timestamp `queryOrder` names
- added cursor discipline that treats a failed window as unfetched: the cursor moves only after the events, the days covered and the cursor itself are committed together, so a crash or a provider error is retried rather than leaving a silent hole in the history. Days are recorded as fetched only when a window covers them end to end, which keeps the incremental phase from claiming a part-day
- added repository discovery from the Backstage catalog. Repositories come from catalog entities and nothing else: the plugin resolves each one through `github.com/project-slug` or `dev.azure.com/project-repo`, falling back to `backstage.io/source-location` matched against the host application's configured integrations. Nothing is enumerated from a provider API any more, which is what removed the per-load cost of listing every project and repository in an organisation
- added Sonar enrichment through `@backstage-community/plugin-sonarqube-backend` over the internal service-to-service channel, so the Sonar token stays where that plugin already keeps it and no second credential is configured here. Sonar history cannot be backfilled through that route — it exposes a current summary per entity and no measures-history passthrough — so the trend begins at the first snapshot after installation rather than at the retention floor
- added tests for everything the coverage config previously hid: the plugin definition, both entry points, the route and API refs, the DI wiring in `main/apis.ts`, the tab router, and the IndexedDB key store. `collectCoverageFrom` now excludes only files that compile to no executable statements (entity shapes, port interfaces, GraphQL/REST node types), so the reported number describes the whole package instead of a chosen subset
- added the background ingestion actor, which runs in two phases against one shared request allowance. The **incremental** phase moves each repository's forward cursor towards now, so a freshly installed plugin answers for the last day on its very first run; only what is left of the allowance goes to the **backfill** phase, which walks each repository backwards a chunk at a time towards the retention floor. That ordering is what lets the selectable range widen from today outwards while the dashboard stays current throughout
- added the daily snapshot task, which captures the state no provider reports retroactively: compliance checks, README badges, the branch list, the latest release and tag, and Sonar measures. On GitHub that is one GraphQL document per repository, replacing three separate requests the browser used to make _per dashboard load_. On Azure DevOps the project's branch policies are fetched **once per project** rather than once per repository — forty repositories in a project previously downloaded one identical payload forty times, which was the single largest source of avoidable traffic
- added the ingestion schema: repositories mirrored from the catalog, per-repository cursors, one indexed table of dated events, the days already fetched, and daily current-state snapshots. The fetched-days table exists so that "no activity" and "not fetched yet" stay distinguishable, which is what lets the dashboard tell a user which range it can actually answer for
- added the read API the dashboard runs on: `GET /v1/repositories`, `GET /v1/repositories/:id/timeseries`, `GET /v1/contributors`, `GET /v1/coverage` and `POST /v1/refresh`, all mounted under `/api/code-health`. Every route serves from the database, so a dashboard load costs the same whether ten people or a thousand are looking at it, and whether the catalog holds ten repositories or a thousand
- added WakaTime enrichment reading `codeHealth.wakaTime.apiKey` from backend configuration. It runs once per pass for the organisation rather than once per repository, and the key is declared `@visibility secret` so it never reaches a browser
- added window validation that bounds every query to the retention period. An unbounded `from` would make one request scan the whole event table, which any signed-in user could have triggered by editing a URL

### Changed

- changed `@backstage/frontend-plugin-api` from `^0.16.0` to `^0.17.3`, which is what `@backstage/core-plugin-api@1.12.8` and `@backstage/core-compat-api@0.5.13` — both already direct dependencies here — require. The stale range made consumers nest a second copy of the package under `node_modules/@rios0rios0/backstage-plugin-code-health/`, alongside the hoisted `0.17.3`. That duplicated `zod`, `zod-to-json-schema` and the whole blueprint set in the app bundle, and it is a latent break rather than a cosmetic one: extension data refs and React contexts do not reliably cross copy boundaries, and one consuming app already had to annotate an `ExtensionDefinition` by hand to stop `tsc` failing with `TS2742` on a type it could only name through the nested path. Nothing in the plugin used an API removed in `0.17` — `NavItemBlueprint` is the only casualty and this plugin never referenced it — so the build, lint and all `413` tests pass unchanged.
- changed `delivery-publish` into a matrix over the publishable workspace packages, each publishing from its own directory. Every package carries the same version and is bumped together, so a single tag still gates the whole release
- changed `jest` and `jest-environment-jsdom` to `^30`, `@types/jest` to `^30`, `@testing-library/jest-dom` to `^7`, `jest-junit` to `^17` and `@types/node` to `^26.1.2`. `@backstage/cli@0.36.4` declares `jest ^29 || ^30`, so the runner move is supported rather than tolerated
- changed `nanoid` to `3.3.17` through a resolution, clearing CVE-2026-67213 (HIGH). It reaches the tree through `@backstage/cli` and `postcss`, and the advisory has a patched release, so it is pinned away rather than suppressed
- changed `react-router-dom` from `7.0.0` to `^7.18.2`. The lockfile had been pinned to `7.0.0` since the repository was created and carried nine high-severity advisories — XSS via open redirects, SSR XSS in `ScrollRestoration`, pre-render data spoofing, unauthenticated RCE through the vendored `turbo-stream@2`, and DoS via both `__manifest` path expansion and inefficient route matching. `7.18.2` has none, and drops the vulnerable `turbo-stream` from the tree entirely
- changed `README.md`, `CONTRIBUTING.md`, `CLAUDE.md` and `.github/copilot-instructions.md`, all four of which asserted that the plugin had no backend of its own. They now describe the three packages, the catalog-driven discovery, the credential story and the decisions worth not re-litigating — the Azure DevOps API defaults that hide most of the data, why rate-limit headers are read on successful responses, and which history genuinely cannot be backfilled
- changed how the latest Azure DevOps tag is chosen. Its refs API returns tags alphabetically and with no dates at all, so taking the first of the list — which `$top=1` did — reliably returned the _oldest_ version-like tag. Version-shaped names are now compared numerically, with a documented fallback for anything else; resolving true dates would cost one annotated-tag lookup per tag per repository per day
- changed the `react-router-dom` peer range to `^6.30.2 || ^7.0.0`. The plugin never imports it, but every `@backstage/*` package it depends on peers on `^6.30.2`, so the previous `^7.0.0`-only range made a stock Backstage app report an unsatisfiable peer
- changed the coverage configuration to match how `backstage-cli repo test` merges Jest config: the thresholds stay global in the root `package.json`, while `collectCoverageFrom` and `roots` move into each package, because their paths resolve against `<package>/src`
- changed the documented release procedure to the AutoBump command that performs it, replacing a hand-written checklist that named the wrong branch (`bump/x.x.x` rather than the `chore/bump-x.x.x` the tool creates and the pipeline matches on) and left the version edits manual. It also records why the global config has to be named explicitly from this directory, and why a breaking change has to lead its changelog entry to count as one
- changed the enforced coverage thresholds from 90/90/77/90 to 95 lines, 95 statements, 92 functions and 88 branches, against measured 99.2/98.9/97.6/93.6 across the whole package
- changed the GitHub repository name from `code-health` to `backstage-plugin-code-health` so it matches the published package; the npm package name, the plugin id, the `codeHealth` app-config key, the proxy paths and the browser storage keys are all unchanged, so nothing consumers depend on moved
- changed the npm trusted-publishing trust entry to pin the new repository name, since the OIDC `repository` claim is matched against a stored string that a rename does not update
- changed the pinned versions of the patched transitive dependencies: `brace-expansion` to `1.1.18`/`2.1.4`/`5.0.9`, `js-yaml` to `4.3.1` and `undici` to `7.29.0`, clearing the last `yarn npm audit` and Trivy SCA findings
- changed the repository into a Yarn workspaces monorepo, with the frontend plugin moving from the repository root to `plugins/code-health/`. Its npm name, plugin id, entry points and published tarball contents are unchanged, so nothing consumers depend on moved. The root package is now private and drives the workspace through `backstage-cli repo lint|test|build`, which is what keeps the merged coverage report and `junit-report.xml` at the repository root where the shared pipeline reads them. This is groundwork for the backend plugin, which cannot share a package with a frontend one because `backstage.role` is singular and the two build to different targets
- changed the Trivy scan to skip `node_modules`, through a `trivy.yaml` at the repository root. The backend's test dependencies pull in `testcontainers` and, eventually, a C library that vendors its own CI `Dockerfile`s; without this those get scanned as though this repository wrote them. Scoping the walk keeps the four `Dockerfile` checks armed for a `Dockerfile` this repository might genuinely add later, which suppressing the findings by id would not

### Fixed

- fixed the `security > sca:yarn-audit` and `security > sca:trivy` jobs, both of which had been failing on `main`
- fixed the claim that npm accepts a trusted-publishing entry for a name it has never seen. It does not: `npm trust` posts to `/-/package/<name>/trust`, which returns `E404` for a package that does not exist, and npm has no pending-publisher concept. A new name has to be created by one hand publish before CI can ever publish it, which `1.0.1` had recorded backwards
- fixed the installation guide overstating how the sidebar entry appears. The page emits a title and icon and the new frontend system derives a nav entry from those, but an app that replaces the sidebar with its own `NavContentBlueprint` places items explicitly and can drop it silently. The README now names the extension IDs (`page:code-health`, plus the four `api:code-health/*`) that such an app needs for `nav.take(...)` and `app.extensions`, and states outright that there is no `nav-item:code-health` to reference.
- fixed the range the frontend and the backend declare on `@rios0rios0/backstage-plugin-code-health-common`, which was still `^1.0.1`. A caret range does not cross a major, and `-common` has never been published at `1.x` at all, so both packages would have shipped depending on something no registry could resolve. `.autobump.yaml` now carries that range as a version file pattern, so it moves with the release rather than being remembered

### Removed

- **BREAKING CHANGE:** removed every direct provider client from the frontend, together with the per-user credential storage they needed: the AES-GCM encryption, the IndexedDB key store, the settings page, the credential gate and the four platform repository implementations. The browser now calls one endpoint — its own backend — and holds no credential at all. The plugin therefore requires `@rios0rios0/backstage-plugin-code-health-backend` and reads repositories from the Backstage catalog; tokens pasted into the old settings page are gone and are not migrated, because they were per-user and per-browser and have no equivalent on the backend
- **BREAKING CHANGE:** removed the `codeHealth.platform`, `codeHealth.organization`, and every `baseUrl` and `proxyPath` option from the frontend configuration. The catalog decides which repositories exist and the host application's `integrations` block supplies the credentials, so there is nothing left to tell a browser. These keys now fail schema validation and must be removed from `app-config.yaml`
- **BREAKING CHANGE:** removed the `codeHealthAuthApiRef` API and the `/settings` route, replacing them with `codeHealthCoverageApiRef`. An app that referenced `api:code-health/auth` in `app.extensions` must reference `api:code-health/coverage` instead
- removed the `Authorization` header from the backend development harness's own documentation. The harness mocks auth and never needed one, and the example tripped Gitleaks' `curl-auth-header` rule. A `.gitleaksignore` entry covers the commit that already shipped it, with the reasoning recorded beside the fingerprint
- removed the `brace-expansion` suppressions from `.yarnrc.yml` and `.trivyignore`. Upstream backported the DoS fix to every line in the tree on 2026-07-30, so the advisory is now pinned away rather than hidden. The `@octokit/*` and `uuid` entries stay: `@backstage/integration@2.0.3` is still the newest release and still pins `@octokit/rest@^19`, and `@backstage/core-components` still pins `@material-table/core@^3`, whose `require("uuid").default.v4()` call no patched `uuid` supports
- removed the date inputs from the contributors table. The toolbar's range picker is the single control over the window, so the two can no longer disagree about which period is on screen
- removed the unreachable `new URL` guard in the catalog repository resolver. `ScmIntegrations.byUrl` parses the target itself and returns `undefined` when it cannot, so the guard behind it could never run; leaving dead defensive code in place is worse than not having it, because it reads as though a failure mode is handled

## [1.0.1] - 2026-07-29

### Changed

- changed npm publishing to authenticate with OIDC trusted publishing instead of an `NPM_TOKEN` secret, so no long-lived publish credential exists in the repository at all; npm revoked classic tokens in December 2025 and 2FA-bypass tokens lose the ability to publish around January 2027, so token-based automation had no future
- changed the publish job to Node 22 and pinned npm to 11.18.0; the OIDC exchange needs npm 11.5.1 or newer and Node 22 bundles npm 10, so the pin is a deliberate choice above that floor rather than the floor itself

### Fixed

- fixed the `npm trust github` invocation documented in `CLAUDE.md`, which exited with a usage error: the workflow is named with `--file` rather than `--workflow`, and `--allow-publish` has to be passed or the trust entry is created without the permission CI needs
- fixed the claim that npm requires a package to exist before accepting a trust entry; npm accepts one for a name that has never been published and the first CI run creates the package, so the manual bootstrap publish that section described was unnecessary — and impossible as written, since `npm publish --provenance` only generates provenance inside CI
- fixed the release notes to record that a tag push runs the workflow file as it exists at that tag, so a tag cut before a change to `.github/workflows/default.yaml` keeps running the old job and re-pushing it cannot pick the change up

### Removed

- removed the dependency cache from the publish job, so a poisoned cache entry cannot reach the published tarball

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
