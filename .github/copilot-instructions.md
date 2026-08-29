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
- **Line churn is null on Azure DevOps**, which reports changed files rather than lines and exposes
  no line count anywhere in its REST API. `ContributorSummary.churnUnit` carries which unit a row
  was measured in, so a view renders the figure it has instead of a zero. Do not infer the unit from
  which number is non-zero: that misreads a real quiet week as a missing measurement.
- **Insights is the landing tab**, at `/`. Contributors is `/contributors` and repositories is
  `/repositories`. It leads because it is the only tab that answers a question about the fleet
  rather than about one row of it.
- **The documentation and API grades need both halves of the evidence.** The catalog half comes from
  discovery, the repository half from the daily snapshot, so both read `null` — "not measured" —
  until a snapshot exists. Grading on half of it reports gaps that are not there.
- **The repository file scan stays shallow**: the root, `docs/` and `api/`. A recursive walk is
  unbounded on a large repository and costs a different amount on each platform, which would make
  the metric incomparable between them.
- **A day is recorded as fetched only when a window covers it end to end.**
- **Cursors move only after the window is committed.**
- **Sonar, compliance and badge history cannot be backfilled**; those series start at installation.
- **The bump desynchronises `yarn.lock`.** `.autobump.yaml` moves the caret range the frontend and
  backend declare on `-common`, and that string is a resolution descriptor in the lockfile, so every
  CI job's `yarn install --immutable` answers `YN0028` until the lockfile is regenerated. The fix is
  `refresh: true` under `languages.typescript` in the **operator's** `~/.autobump.yaml` (AutoBump
  3.0.0+), not in this repository's `.autobump.yaml`: a project file may switch the refresh off but
  never on, because turning it on starts a package manager. See `CLAUDE.md` > Release.
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
5. Add a changelog fragment with `chlog new --kind <Kind> --body "..."` — never edit
   `CHANGELOG.md`, which is generated from them
6. Update `README.md` when behaviour, configuration or setup changed

<!-- chlog:start -->
## Changelog (chlog) — MANDATORY

If the repository you are working in uses chlog (a `.chlog.yaml` or `.chlog.yml`
config file, or a `.changes/` directory, exists at the project root), the
following is binding and ALWAYS applies: whenever you make ANY change, you MUST
create a changelog fragment as part of the same change — automatically, without
being asked, before committing.

- Do NOT edit CHANGELOG.md directly; it is generated from fragments.
- Create the fragment with:
  `chlog new --kind <Kind> --body "<imperative description>"`
- Valid kinds: Added, Changed, Deprecated, Removed, Fixed, Security
- Choose the kind that best matches the change (e.g., new feature → Added,
  bug fix → Fixed, behavior change → Changed, removal → Removed, security fix → Security).
- If the change is backward-INCOMPATIBLE with the public API (a breaking
  change), you MUST add the `--breaking` flag:
  `chlog new --kind <Kind> --breaking --body "<description>"`.
  This is the ONLY thing that triggers a major version bump — the kind alone
  never does (per SemVer, major = incompatible change). When unsure whether a
  change breaks compatibility, ask the user instead of guessing.
- Fragments are YAML files in `.changes/unreleased/`; stage them with your commit.
- `chlog check` fails the build when a fragment is missing — never skip it.
<!-- chlog:end -->
