# Code Health — AI assistant instructions

## What this repository is

A Yarn workspaces monorepo holding the three packages of the Code Health Backstage plugin:

| Package | Directory | Backstage role |
|---|---|---|
| `@rios0rios0/backstage-plugin-code-health` | `plugins/code-health` | `frontend-plugin` |
| `@rios0rios0/backstage-plugin-code-health-backend` | `plugins/code-health-backend` | `backend-plugin` |
| `@rios0rios0/backstage-plugin-code-health-common` | `plugins/code-health-common` | `common-library` |

The backend discovers repositories from the Backstage catalog, authenticates through the host
application's `integrations` configuration, ingests a year of history in a rate-limited background
job, and stores it in the Backstage database. The browser talks only to `/api/code-health` and holds
no credential.

All three packages share one version and are bumped together.

## Bootstrap

```bash
corepack enable
yarn install
```

## Commands and expected timings

| Command | What it does | Roughly |
|---|---|---|
| `yarn typecheck` | One `tsc` pass over the whole workspace | 25 s |
| `make lint` | ESLint plus knip across all packages | 45 s |
| `make test` | Jest across all packages (~600 tests) | 45 s |
| `yarn build` | `tsc` then `backstage-cli repo build --all` | 45 s |
| `make sast` | CodeQL, Semgrep, Trivy, Hadolint, Gitleaks | 2-4 min |

**NEVER run `jest`, `eslint`, `gitleaks`, `semgrep`, `trivy`, `hadolint` or `codeql` directly.** Use
the `make` targets, which load the correct configuration from the
[rios0rios0/pipelines](https://github.com/rios0rios0/pipelines) scripts first.

The root scripts use `backstage-cli repo lint | test | build` rather than the per-package commands,
because `repo test --coverage` writes the merged `coverage/` and `junit-report.xml` at the repository
root where the shared pipeline reads them.

## Architecture

The backend is hexagonal: `domain/` holds entities, commands and ports, `infrastructure/` holds the
implementations, and the dependency arrow points inward. The frontend follows the same rule across
its five layers.

```
plugins/code-health-backend/src/
  domain/entities|commands|repositories|services/
  infrastructure/repositories|services|http|controllers/
  plugin.ts

plugins/code-health/src/
  domain/ service/ infrastructure/ presentation/ main/
```

## Things not to change without understanding why

- **Repositories come from the catalog only.** Nothing is enumerated from a provider API. Listing an
  organisation on every dashboard load is what caused the Azure DevOps throttling this design fixes.
- **Every provider request goes through `ProviderGateway`.** It bounds concurrency and total
  requests, retries with jittered backoff, and breaks the circuit on a failing host. A collector
  that calls `fetch` directly bypasses all of it.
- **Rate-limit headers are read on every response, not only errors.** Azure DevOps throttles by
  adding latency to a successful `200` and sends `Retry-After` before it starts rejecting anything.
- **Two Azure DevOps defaults are set explicitly.** Its pull request API returns only *active*
  requests filtered on *creation* time; its build query applies the window to whichever timestamp
  `queryOrder` names.
- **Branch policies are fetched once per project**, cached for the whole snapshot pass.
- **The latest Azure DevOps tag is chosen by version comparison**, because its refs API returns tags
  alphabetically with no dates.
- **Line churn is null on Azure DevOps**, which reports changed files rather than lines.
- **A day is recorded as fetched only when a window covers it end to end.**
- **Cursors move only after the window is committed.**
- **Sonar, compliance and badge history cannot be backfilled**; those series start at installation.
- **The bump desynchronises `yarn.lock`.** `.autobump.yaml` moves the caret range the frontend and
  backend declare on `-common`, and that string is a resolution descriptor in the lockfile, so every
  CI job's `yarn install --immutable` answers `YN0028` until the lockfile is regenerated. The fix is a
  `refresh_commands` entry in the operator's `~/.autobump.yaml` — it cannot go in this repository's
  own `.autobump.yaml`, where AutoBump drops it as untrusted. See `CLAUDE.md` > Release.
- **`.github/workflows/default.yaml` passes `install_run_scripts: true`.** The shared workflow
  installs with `--mode=skip-build`, and `better-sqlite3` is a native addon the store tests need.
  Removing the flag fails every `KnexCodeHealthStore` test with "Could not locate the bindings file".

## Conventions

- `snake_case` file names throughout
- No `any` — use `unknown` with narrowing
- BDD tests: `// given`, `// when`, `// then`
- No mock libraries; hand-rolled doubles in `test/doubles/`, builders in `test/builders/`
- Material UI v4 and React 18 in the frontend, matching the Backstage peer ranges

## Testing

Coverage is enforced repo-wide at 95% lines/statements, 92% functions, 88% branches. Write the test
rather than adding an exclusion.

- The store is tested against a real database (`TestDatabases`) with the real migrations applied.
- Collectors and the HTTP gateway are tested against a real `http.createServer`.
- The plugin is tested through `startTestBackend` with `supertest`.
- Ingestion is held to a manual trigger in the plugin tests, so they never reach the network.

## Validation checklist before proposing a change

1. `yarn typecheck`
2. `make lint`
3. `make test`
4. `make sast` when dependencies or configuration changed
5. Update `CHANGELOG.md` under `[Unreleased]`
6. Update `README.md` when behaviour, configuration or setup changed
