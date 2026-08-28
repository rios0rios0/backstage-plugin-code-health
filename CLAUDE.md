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

Four optional integrations enrich that history and are absent unless configured: **Sonar** (through
the community backend plugin), **WakaTime** (coding time and AI token counts), and **Jira** and
**Confluence** (one Atlassian credential lights up both). They each identify people under their own
account system, which is why a contributor row is a *person* rather than an account and why the
**Identities** tab exists.

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
| `migrations/20260901000000_identities.js` | The person directory and the per-source measures table |
| `src/infrastructure/repositories/knex_code_health_store.ts` | Persistence; commits events, fetched days and cursors in one transaction |
| `src/infrastructure/http/provider_gateway.ts` | The single door every provider request passes through |
| `src/domain/commands/discover_repositories.ts` | Catalog → tracked repositories |
| `src/domain/commands/ingest_repository_history.ts` | The two-phase background actor |
| `src/domain/commands/capture_repository_snapshots.ts` | Daily current-state capture, and every optional enricher's pass |
| `src/domain/entities/person_directory.ts` | Which person an account belongs to, built per request from the link table |
| `src/domain/commands/reconcile_identities.ts` | The one automatic link: an account whose e-mail matches a catalog `User` |
| `src/domain/commands/link_identity.ts` / `list_identities.ts` | The Identities screen's read and its two writes |
| `src/infrastructure/services/collectors/` | Azure DevOps and GitHub collectors |
| `src/infrastructure/services/wakatime_enricher.ts` | Coding time and AI tokens, per member per day |
| `src/infrastructure/services/atlassian/` | One client, the Jira enricher and the Confluence enricher |
| `src/infrastructure/controllers/code_health_router.ts` | The read API, the capabilities probe and the identity links |
| `docs/wakatime.md`, `docs/jira.md`, `docs/confluence.md` | What each integration measures, and what its provider cannot answer |

### Frontend (`plugins/code-health`)

5-layer Clean Architecture; dependencies point inward toward Domain.

| File | Purpose |
|---|---|
| `src/plugin.ts` / `src/alpha.tsx` | Legacy and declarative entry points |
| `src/main/apis.ts` / `src/main/api_refs.ts` | `createApiFactory` wiring; one stateless client behind six data refs (repositories, contributors, coverage, time series, integrations, identities), plus a separate config ref |
| `src/infrastructure/http/code_health_backend_client.ts` | The only thing the browser talks to |
| `src/main/router.tsx` | Page composition, the backend-reachability gate and the capabilities probe; Insights is the root tab |
| `src/presentation/pages/identities_page.tsx` | Attaching an account to a catalog `User` — the plugin's only write |
| `src/presentation/components/columns/` | One column-group factory per integration, called only when its flag is set |
| `src/presentation/components/insights/` | One Insights card set per integration, on the same terms |
| `src/domain/entities/time_range.ts` | Which windows are offered, bounded by coverage — rolling ranges and calendar months |
| `src/presentation/components/range_picker.tsx` | One control for both, so the two can never disagree |
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
  the same name. Azure DevOps exposes no line count anywhere in its REST API — reconstructing one
  would mean diffing every blob of every commit — so `ContributorSummary.churnUnit` carries the unit
  each row was measured in and the table prints it under the figure. Before that field existed the
  contributors table showed `0 / +0 / -0` for an entire Azure DevOps fleet, which reads as "nobody
  wrote any code" rather than as "the provider never said". The unit is decided by whether the
  provider *reported* the field, never by whether the value came back above zero: a quiet week is a
  real measurement of zero.
- **Insights is the landing tab.** It is the only tab that answers a question about the fleet rather
  than about one row of it, so it is what someone opening the plugin cold wants first; the two
  tables are the drill-down. Moving it to `/` cost the `insights` sub route, which is the breaking
  change the changelog leads with — an app deep-linking to `/insights` has to move to the plugin
  root, and `codeHealthPlugin.routes.insights` became `routes.repositories`.
- **Documentation and catalog-API grades combine the entity with the repository.** The catalog half
  (`backstage.io/techdocs-ref`, `spec.providesApis`, `spec.type`, `metadata.links`) is read by
  discovery and stored on the repository row, because it changes when somebody edits a YAML file
  rather than on the snapshot's schedule. The repository half (a `docs/` tree, an API definition) is
  read by the daily snapshot. Both fields stay `null` until a snapshot exists, because grading on
  half the evidence reports a gap that is not there.
- **The repository file scan is shallow on purpose** — the root, `docs/` and `api/`. On GitHub the
  three trees ride along in the snapshot's existing GraphQL document and cost no request at all; on
  Azure DevOps it is one listing per repository plus one for each of those directories that exists.
  A recursive walk would be unbounded on a large repository and would cost a different amount on
  each platform, which is exactly what makes a cross-platform metric meaningless.
- **A README does not count as documentation.** Nearly every repository has one, so counting it
  would grade the whole fleet documented. It is still reported as a check, because "has a README and
  nothing else" and "has nothing at all" are different conversations to have with a team.
- **A day is recorded as fetched only when a window covers it end to end**, so "no activity" and
  "not fetched yet" stay distinguishable and the range picker never offers a period it can only
  answer partially.
- **A cursor moves only after its window is committed.** A failed window is retried rather than
  leaving a hole nothing later would notice.
- **A contributor row is a person, not an account.** Commits arrive under a commit-author address
  or a login, coding time under a WakaTime username, tickets under an Atlassian `accountId`, and
  none of the three matches the others. Keyed by account, one human occupied three rows that each
  held a third of the story. `PersonDirectory` resolves accounts through the link table on *read*,
  never at collection time, which is what makes correcting a link retroactive across every window
  ever collected. An account nobody has linked keys under `<source>:<sourceKey>` and keeps its own
  row — hiding it would hide every bot, every service account and everybody nobody has linked yet,
  which are exactly the rows that show the work is unfinished.
- **Only an e-mail match links automatically.** It is the same rule the catalog itself uses to
  decide who a `User` is. Everything weaker — a shared local part, an identical display name, a
  username resembling a name — is *offered* as a ranked suggestion and applied only when a person
  confirms it, because two people who share a surname would silently become one contributor and a
  merge nobody asked for is far harder to notice than a row that stayed separate. A manual link is
  never overwritten by the automatic rule; the store enforces that rather than trusting callers,
  since reconciliation runs on every ingestion pass.
- **Integration columns are gated on configuration, not on data.** `/v1/capabilities` reports which
  integrations the backend was configured with, and each column group is a *factory* the table calls
  only when its flag is set. Inferring it from whether a row carries a value cannot tell a
  switched-off integration from one that is on and has not collected yet, and it makes a freshly
  configured install look broken until the first nightly pass. The one exception is the WakaTime AI
  column group, which is gated on the data as well — opting out of the AI figures is a supported way
  to run WakaTime, and a screen of em dashes reads as a fault rather than a choice.
- **WakaTime members hang off a dashboard, not off the organisation.** There is no
  `/orgs/{org}/members`; the path is `/users/current/orgs/{org}/dashboards` → `/members` →
  `/members/{memberId}/summaries`, and members are addressed by their **member id** rather than
  their username. Getting that wrong returns empty summaries for everybody rather than failing.
- **WakaTime is stored a day at a time; the whole window is re-read every run.** `summaries` answers
  for an arbitrary span in one request per member, so asking for thirty days costs exactly what
  asking for one costs — and re-reading repairs a day collected while somebody's editor was offline.
  The AI figures come from `durations`, which takes a single date, so they cost one request per
  member per day, are opt-in, and catch up a few days per run. AI history therefore accumulates
  forwards rather than being backfilled, and a chart of it starting in the middle is the design.
- **A repository's coding time is derived on read, never stored on the snapshot.** WakaTime measures
  a person and a *project*; the time a repository received is the sum of what its people logged
  against the matching project, which is a question about a window rather than about the day the
  snapshot was taken.
- **Jira is stored per day, Confluence per window.** Jira's enricher fetches the window's issues
  once and slices them arithmetically, so a per-day breakdown costs nothing. Confluence's written
  volume walks a page's version bodies, so slicing it per day would multiply the walks by the length
  of the window — its figures describe a trailing window, and the columns say so rather than leaving
  a reader to assume.
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
  on `main` **and** the branch added a changelog fragment under `.changes/unreleased/`. On a
  `bump/*` branch the same check flips and demands an updated `CHANGELOG.md` instead.
- `management > report:sonarqube` is gated on a non-empty `sonar_host` input, which
  `.github/workflows/default.yaml` does not pass. The repository forwards `SONAR_TOKEN` but has no
  SonarCloud project, so enabling the input would turn a skip into a failure.

`tests > test:all` also emits a warning annotation about a missing `vite.config.ts`. That comes from
`davelosert/vitest-coverage-report-action` in the shared workflow, which hardcodes the path; the
action still reads the Jest `coverage-summary.json` correctly and the job passes. Do not add a
`vite.config.ts` to silence it — this project has no Vite in its toolchain.

### `install_run_scripts: true`

The shared workflow installs with `yarn install --immutable --mode=skip-build`, so no dependency's
lifecycle script runs as the CI user. This repository has to opt back in, because the store tests
open a real SQLite database through `TestDatabases` and `better-sqlite3` is a native addon: its
install script is what produces `build/Release/better_sqlite3.node`. Without the flag every
`KnexCodeHealthStore` test fails with "Could not locate the bindings file", listing the paths it
tried — which is the signature to recognise, since nothing in the message names the install mode.

The flag does not restore lifecycle scripts during resolution. It appends `yarn rebuild` after the
install, so build scripts run only once the lockfile CI already refused to modify is in place.

Reproduce it locally with `rm node_modules/better-sqlite3/build/Release/better_sqlite3.node` followed
by `yarn install --immutable --mode=skip-build`; `yarn rebuild` puts it back.

This arrived without a commit here: the shared workflow is referenced at `@main`, and the change
landed upstream on 2026-08-18 in `rios0rios0/pipelines@fd67e75`. A green `main` can therefore go red
with nothing in this repository having moved.

### `trivy.yaml`

Trivy's misconfiguration walk skips `node_modules`. A devDependency chain
(`@backstage/backend-test-utils` → `testcontainers` → `dockerode` → `ssh2` → `cpu-features`) vendors
a C library whose own CI `Dockerfile`s would otherwise be scanned as though this repository wrote
them. Scoping the walk keeps those checks armed for a `Dockerfile` this repository might genuinely
add later, which suppressing the findings by id would not.

## Release

CI runs `rios0rios0/pipelines/.github/workflows/yarn-library.yaml` on every push and pull request.
There is no deployment target — the artifacts are three npm packages.

Releasing is [AutoBump](https://github.com/rios0rios0/autobump)'s job: `autobump -c ~/.autobump.yaml
local .` reads `[Unreleased]`, derives the version, moves the entries under a dated heading, writes
that version to all four `package.json` files, branches `chore/bump-x.x.x`, and opens the PR.

1. Naming the global config with `-c` is required, not tidiness. AutoBump searches the working
   directory before `$HOME`, under the same four names `.autobump.yaml` uses, so from the repository
   root it would otherwise load the per-project overrides *as* the global config and find no
   credentials in them.
2. `.autobump.yaml` exists because AutoBump's TypeScript defaults know one version file. Here that is
   the private workspace root, which is never published, so `plugins/*/package.json` is appended.
   Without it a release ships three packages still claiming the previous version, and
   `delivery-publish`'s tag-versus-`package.json` guard fails all three.
3. That file's **second** pattern moves the caret range the frontend and the backend declare on
   `-common`, and moving it desynchronises `yarn.lock` — see the section below. The version bumps
   themselves are lockfile-neutral, because Yarn records a workspace as `0.0.0-use.local` and never
   writes its version into the lockfile at all.
4. The bump level comes from the changelog itself: a line **beginning** `- **BREAKING CHANGE:**` is
   major, `### Added` is minor, everything else patch. A breaking change explained mid-sentence
   counts for nothing — this is why the `2.0.0` entries lead with the marker.
5. The merge commit must keep `chore/bump-x.x.x` or `chore(bump): ...version to x.x.x` — that string
   is what the pipeline matches on.
6. On merge, `delivery-release` (from the shared workflow) cuts the tag and GitHub Release, and
   `delivery-publish` (in `.github/workflows/default.yaml`) publishes each package to npm.

### The lockfile the bump desynchronises

The frontend and the backend declare a caret range on `-common`, and `.autobump.yaml` moves it on
every release so the three published packages install as a matched set. That exact string is also a
**resolution descriptor** in `yarn.lock` (the selector for the workspace package):

    "@rios0rios0/backstage-plugin-code-health-common@npm:^X.Y.Z, @rios0rios0/backstage-plugin-code-health-common@workspace:plugins/code-health-common":

AutoBump rewrites version files with regular expressions and does not run a package manager, so the
lockfile is left behind. Every CI job then starts with `yarn install --immutable`, which refuses:

```
YN0028: The lockfile would have been modified by this install, which is explicitly forbidden.
```

The whole gate goes red, and so would `delivery-publish` after a merge — the release is blocked, not
merely noisy. `2.3.0` hit this.

**The fix is a `refresh_commands` entry in the operator's `~/.autobump.yaml`**, which regenerates
`yarn.lock` inside the bump commit:

```yaml
languages:
  typescript:
    refresh_commands:
      - run: ['yarn', 'install', '--mode=update-lockfile']
        files: ['yarn.lock']
```

**It cannot live in this repository's `.autobump.yaml`, and putting it there does nothing.**
AutoBump reads a project's own config out of the repository it is releasing, which in `run` mode is a
repository it discovered rather than one anybody vetted; honouring an executable from there would let
any scanned repository run code with the release credentials. `SanitizeUntrustedLanguages` therefore
drops a non-empty `refresh_commands` arriving from a project file, warning and continuing. A project
file may only write `refresh_commands: []`, to opt **out**.

Requires AutoBump carrying `rios0rios0/autobump#317`. On an older binary the key is not merely
ignored — user config is decoded with `KnownFields(true)`, so an unrecognised key **aborts the
release**. Check `autobump version` before adding it.

Without that entry the lockfile has to be refreshed by hand on every release, after AutoBump has
opened the PR and checked you back out to `main`:

```bash
git fetch origin && git checkout chore/bump-X.Y.Z
yarn install --mode=update-lockfile
git add yarn.lock && git commit --amend --no-edit
git push --force-with-lease
```

`--mode=update-lockfile` resolves without linking, and `^X.Y.Z` resolves against the local workspace,
so it does not go looking for a version that is not on npm yet.

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

**Each package name needs its own trust entry, and the package has to exist before you can create
one.** The endpoint is package-scoped — `POST /-/package/<name>/trust` — so a name npm has never seen
returns `E404`, whatever the credentials. npm has no pending-publisher concept the way PyPI does.
That makes the first publish of a new name a chicken-and-egg problem: CI cannot publish it without a
trust entry, and the trust entry cannot exist without the package. It is broken by publishing once by
hand, then creating the entry, after which every later release comes from CI.

`1.0.1` recorded the opposite ("a package does not need to exist first"). That was wrong, and cost a
release cycle when `-backend` and `-common` both returned `E404` on `2.0.0`.

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

The bootstrap publish must drop `--provenance`. Provenance is only generated inside supported CI, so
that flag fails on a workstation; the one hand-published version is therefore unattested, and that is
the price of creating the name. Keep it off the release: publish a throwaway version under a
non-`latest` dist-tag, create the trust entry, let CI publish the real one with provenance, then
deprecate the throwaway. Publishing the release itself by hand would leave the version everybody
installs as the only unattested one there is.

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
