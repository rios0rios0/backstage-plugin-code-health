# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A Yarn workspaces monorepo holding the three packages of the Code Health [Backstage](https://backstage.io)
plugin:

| Package | Directory | Role |
|---|---|---|
| `@rios0rios0/backstage-plugin-code-health` | `plugins/code-health` | `frontend-plugin` — the dashboard |
| `@rios0rios0/backstage-plugin-code-health-backend` | `plugins/code-health-backend` | `backend-plugin` — discovery, ingestion, read API |
| `@rios0rios0/backstage-plugin-code-health-common` | `plugins/code-health-common` | `common-library` — the wire contract |

The backend discovers repositories from the **Backstage catalog**, authenticates through the host
application's existing **`integrations`** configuration, ingests a year of history in a rate-limited
background job, and stores it in the Backstage database. The browser talks only to
`/api/code-health` and holds no credential at all.

All three packages share one version and are bumped together.

## Commands

```bash
corepack enable        # Enable Yarn Berry via corepack (first time only)
yarn install           # Install dependencies
yarn build             # tsc + backstage-cli repo build --all
yarn typecheck         # One type-check pass over the whole workspace
make lint              # ESLint and knip via pipeline scripts
make test              # Jest across all packages via pipeline scripts
make sast              # CodeQL, Semgrep, Trivy, Hadolint, Gitleaks
```

**Never run `eslint`, `jest`, or SAST tools directly.** Always use `make` targets, which invoke the
[rios0rios0/pipelines](https://github.com/rios0rios0/pipelines) scripts.

The root scripts use `backstage-cli repo lint | test | build`, not the per-package commands. That is
load-bearing: `repo test --coverage` writes a merged `coverage/` and `junit-report.xml` at the
repository root, which is exactly where the shared pipeline looks for them.

To exercise the backend alone:

```bash
yarn workspace @rios0rios0/backstage-plugin-code-health-backend start
curl http://localhost:7007/api/code-health/health
```

## Architecture

### Backend (`plugins/code-health-backend`)

Hexagonal: `domain/` holds entities, commands and ports; `infrastructure/` holds the implementations.

| File | Purpose |
|---|---|
| `src/plugin.ts` | `createBackendPlugin`, DI wiring, the three scheduled tasks |
| `migrations/20260810000000_init.js` | The whole schema, portable Knex only |
| `src/infrastructure/repositories/knex_code_health_store.ts` | Persistence; commits events, fetched days and cursors in one transaction |
| `src/infrastructure/http/provider_gateway.ts` | The single door every provider request passes through |
| `src/domain/commands/discover_repositories.ts` | Catalog → tracked repositories |
| `src/domain/commands/ingest_repository_history.ts` | The two-phase background actor |
| `src/domain/commands/capture_repository_snapshots.ts` | Daily current-state capture |
| `src/infrastructure/services/collectors/` | Azure DevOps and GitHub collectors |
| `src/infrastructure/controllers/code_health_router.ts` | The read API |

### Frontend (`plugins/code-health`)

5-layer Clean Architecture; dependencies point inward toward Domain.

| File | Purpose |
|---|---|
| `src/plugin.ts` / `src/alpha.tsx` | Legacy and declarative entry points |
| `src/main/apis.ts` | `createApiFactory` wiring; one stateless client behind three refs |
| `src/infrastructure/http/code_health_backend_client.ts` | The only thing the browser talks to |
| `src/main/router.tsx` | Page composition and the backend-reachability gate |
| `src/domain/entities/time_range.ts` | Which windows are offered, bounded by coverage |
| `src/presentation/components/backfill_progress.tsx` | Why wider ranges are not available yet |

## Decisions worth not re-litigating

- **The catalog is the only source of repositories.** Nothing is enumerated from a provider API. The
  previous design listed every project and repository in the organisation on every dashboard load,
  which is what produced the Azure DevOps throttling this release exists to fix.
- **Rate-limit headers are read on every response, not only on errors.** Azure DevOps applies
  throttling as *latency on a successful `200`* and sends `Retry-After` and `X-RateLimit-*` before
  it starts delaying. Inspecting them only on failure misses the entire warning.
- **Two Azure DevOps API defaults are overridden explicitly** because both hide most of the data:
  the pull request API returns only *active* requests filtered on *creation* time, and the build
  query's `minTime`/`maxTime` apply to whichever timestamp `queryOrder` names.
- **Azure DevOps branch policies are fetched once per project**, not once per repository. Forty
  repositories in a project used to download one identical payload forty times.
- **The latest Azure DevOps tag is chosen by version comparison.** Its refs API returns tags
  alphabetically with no dates at all, so `$top=1` reliably returned the *oldest* version-like tag.
- **Churn is not comparable across platforms.** GitHub reports added and deleted lines; Azure DevOps
  reports changed files. The line fields stay null there rather than carrying a different unit under
  the same name.
- **A day is recorded as fetched only when a window covers it end to end**, so "no activity" and
  "not fetched yet" stay distinguishable and the range picker never offers a period it can only
  answer partially.
- **A cursor moves only after its window is committed.** A failed window is retried rather than
  leaving a hole nothing later would notice.
- **Sonar, compliance and badge history cannot be backfilled.** No provider reports what they looked
  like last March, and the `sonarqube` plugin exposes no measures-history passthrough. Those series
  begin at the first snapshot after installation, and the UI has to say so.

## Conventions

- **snake_case** for all file names
- **No `any`** — use `unknown` with type narrowing
- **BDD tests** with `// given`, `// when`, `// then` blocks
- **No mock libraries.** Hand-rolled doubles in `test/doubles/`, builders in `test/builders/`
- Material UI **v4** (`@material-ui/core`), matching `@backstage/core-components`
- React **18**, matching the Backstage peer ranges

## Testing

Coverage thresholds are enforced repo-wide in the root `package.json` at 95% lines/statements, 92%
functions and 88% branches. `backstage-cli repo test` splits the root `jest` block: keys Jest accepts
per project (`collectCoverageFrom`, `roots`) are forwarded to every package and then overridden by
that package's own block; the rest (`coverageThreshold`, `coverageReporters`) stay global. Per-package
exclusions therefore live in each `package.json`, because their paths resolve against `<package>/src`.

Where the interesting tests live:

- **The store** runs against a real database via `TestDatabases`, with the real migrations applied.
- **Collectors and the gateway** run against a real `http.createServer`, so the query strings they
  build are parsed by an actual HTTP stack.
- **The plugin** runs through `startTestBackend` with `supertest`.

Ingestion is held to a **manual trigger** in the plugin tests. Left on a schedule it would start
immediately under `startTestBackend` and issue real requests to `api.github.com`.

Do not add a `collectCoverageFrom` exclusion to make a threshold pass; write the test instead.

### Jobs that skip on purpose

- `code-check > quality:basic-checks` is gated on `github.event_name == 'pull_request'`, so it never
  runs on a push to `main`. On a pull request it does run, and it fails unless the branch is rebased
  on `main` **and** `CHANGELOG.md` gained entries under `[Unreleased]`.
- `management > report:sonarqube` is gated on a non-empty `sonar_host` input, which
  `.github/workflows/default.yaml` does not pass. The repository forwards `SONAR_TOKEN` but has no
  SonarCloud project, so enabling the input would turn a skip into a failure.

`tests > test:all` also emits a warning annotation about a missing `vite.config.ts`. That comes from
`davelosert/vitest-coverage-report-action` in the shared workflow, which hardcodes the path; the
action still reads the Jest `coverage-summary.json` correctly and the job passes. Do not add a
`vite.config.ts` to silence it — this project has no Vite in its toolchain.

### `trivy.yaml`

Trivy's misconfiguration walk skips `node_modules`. A devDependency chain
(`@backstage/backend-test-utils` → `testcontainers` → `dockerode` → `ssh2` → `cpu-features`) vendors
a C library whose own CI `Dockerfile`s would otherwise be scanned as though this repository wrote
them. Scoping the walk keeps those checks armed for a `Dockerfile` this repository might genuinely
add later, which suppressing the findings by id would not.

## Release

CI runs `rios0rios0/pipelines/.github/workflows/yarn-library.yaml` on every push and pull request.
There is no deployment target — the artifacts are three npm packages.

Releasing follows the changelog process:

1. Branch `bump/x.x.x`, move `[Unreleased]` into a dated version heading and set the same version in
   **all three** `package.json` files.
2. Open a PR to `main`. The merge commit must carry `chore/bump-x.x.x` or
   `chore(bump): ...version to x.x.x` — that string is what the pipeline matches on.
3. On merge, `delivery-release` (from the shared workflow) cuts the tag and GitHub Release, and
   `delivery-publish` (in `.github/workflows/default.yaml`) publishes each package to npm.

`delivery-publish` is repo-local because publishing to a registry is not part of any of the shared
`*-library.yaml` workflows. It runs as a matrix over the three package directories, only after the
quality gate passes, publishes with `npm publish --provenance` so each tarball is attested to the
workflow run, and no-ops when a version is already on the registry — which is what makes the
tag-push recovery path safe to re-run.

A tag push runs the workflow file **as it exists at that tag**, not the one on `main`. A tag cut
before a change to `.github/workflows/default.yaml` therefore keeps running the old job forever, and
re-pushing it cannot pick the change up. That is why `1.0.0` — cut before OIDC landed, when the job
still read a non-existent `NPM_TOKEN` — was published from a second tag, `v1.0.0`, placed on the
commit that carried the new workflow; the version guard accepts it because it compares `${TAG#v}`
against `package.json`. Both tags are kept: the provenance attestation references `refs/tags/v1.0.0`,
so deleting it would leave the attestation pointing at a ref that no longer exists.

### Authentication — trusted publishing (OIDC)

**There is no `NPM_TOKEN` secret, and there must not be one.** The job authenticates with npm
through OIDC trusted publishing: GitHub mints a short-lived id-token for the run, npm exchanges it
for a credential scoped to this repository and this workflow file, and nothing long-lived is ever
stored. This is not merely preferable, it is the only automated path with a future — npm revoked all
classic tokens in December 2025, capped write-scoped granular tokens at 90 days, and 2FA-bypass
tokens (the only kind usable unattended) lose the ability to publish around January 2027.

**Each package name needs its own trust entry.** They are configured once, out of band. A package
does not need to exist first: npm accepts a trust entry for a name that has never been published, and
the first CI run creates the package.

```bash
npm login                                                  # 2FA, 2-hour session
npm trust github @rios0rios0/backstage-plugin-code-health \
  --file default.yaml \
  --repo rios0rios0/backstage-plugin-code-health \
  --allow-publish
npm trust github @rios0rios0/backstage-plugin-code-health-backend \
  --file default.yaml --repo rios0rios0/backstage-plugin-code-health --allow-publish
npm trust github @rios0rios0/backstage-plugin-code-health-common \
  --file default.yaml --repo rios0rios0/backstage-plugin-code-health --allow-publish
npm trust list @rios0rios0/backstage-plugin-code-health    # verify
```

The workflow is named with `--file`, not `--workflow`, and `--allow-publish` has to be passed or the
entry is created without the permission CI needs. Both `npm trust` and the OIDC exchange require npm
11.5.1 or newer — check `npm --version` before blaming the trust entry, because a version manager's
default npm is easily older than the system one and reports `npm trust` as an unknown command.

Do not try to bootstrap by hand with `npm publish --provenance` from a workstation. Provenance is
only generated inside supported CI, so that command fails locally, and dropping the flag to force it
through would publish an unattested tarball for no reason.

Publishing must be pinned to the `rios0rios0/backstage-plugin-code-health` repository and the
`default.yaml` workflow filename. Both halves of that pin are load-bearing: renaming the workflow
file breaks publishing, and so does renaming the repository, because the OIDC token's `repository`
claim is matched against a stored string that no rename updates. `npm trust` has no update verb —
only `github` to create, `list` and `revoke --id` — so a rename is handled by adding an entry for the
new name and revoking the old one. That is what the `code-health` → `backstage-plugin-code-health`
rename required.

For a stricter posture, a trust relationship can be made **stage-only**: CI then runs
`npm stage publish`, the version is held privately, and a maintainer releases it with
`npm stage approve <stage-id>` under 2FA. That trades the hands-off release for a human checkpoint;
the current setup publishes directly.
