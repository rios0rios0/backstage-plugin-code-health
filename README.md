<h1 align="center">backstage-plugin-code-health</h1>
<p align="center">
    <a href="https://github.com/rios0rios0/backstage-plugin-code-health/releases/latest">
        <img src="https://img.shields.io/github/release/rios0rios0/backstage-plugin-code-health.svg?style=for-the-badge&logo=github" alt="Latest Release"/></a>
    <a href="https://github.com/rios0rios0/backstage-plugin-code-health/blob/main/LICENSE">
        <img src="https://img.shields.io/github/license/rios0rios0/backstage-plugin-code-health.svg?style=for-the-badge&logo=github" alt="License"/></a>
    <a href="https://github.com/rios0rios0/backstage-plugin-code-health/actions/workflows/default.yaml">
        <img src="https://img.shields.io/github/actions/workflow/status/rios0rios0/backstage-plugin-code-health/default.yaml?branch=main&style=for-the-badge&logo=github" alt="Build Status"/></a>
    <a href="https://www.npmjs.com/package/@rios0rios0/backstage-plugin-code-health">
        <img src="https://img.shields.io/npm/v/@rios0rios0/backstage-plugin-code-health?style=for-the-badge&logo=npm" alt="npm"/></a>
</p>

A [Backstage](https://backstage.io) plugin that shows CI status, releases, tags, compliance checks
and contributor metrics for the repositories in your Backstage catalog, with a year of history you
can scrub through.

Repositories come from the catalog. Credentials come from your existing `integrations`
configuration. A background actor collects the history once for the whole organisation and stores it
in the Backstage database, so opening the dashboard costs one request no matter how many
repositories exist or how many people are looking.

## Packages

| Package | Role |
|---|---|
| [`@rios0rios0/backstage-plugin-code-health`](https://www.npmjs.com/package/@rios0rios0/backstage-plugin-code-health) | Frontend plugin — the dashboard |
| [`@rios0rios0/backstage-plugin-code-health-backend`](https://www.npmjs.com/package/@rios0rios0/backstage-plugin-code-health-backend) | Backend plugin — discovery, ingestion and the read API |
| [`@rios0rios0/backstage-plugin-code-health-common`](https://www.npmjs.com/package/@rios0rios0/backstage-plugin-code-health-common) | The wire contract shared by both |

Both plugins are required. The frontend renders nothing useful without the backend, and says so
rather than showing an empty dashboard.

## Features

- **CI status**: the latest pipeline or workflow outcome on each repository's default branch
- **Releases & tags**: latest release with relative date, or the latest tag when no release exists
- **Compliance checks**: pipeline present, build policy on pull requests, build policy expiration and branch protection
- **README badge audit**: which of the six standard shields are present in each repository's README
- **Contributor metrics**: commits, churn, pull requests opened and merged, review approval rate and pipeline success rate
- **Sonar integration** through the community `sonarqube` backend plugin, so its token stays where that plugin already keeps it
- **WakaTime integration**: 30-day coding time and daily average per contributor
- **A year of history**: pick any window from the last hour to the last 365 days
- **Two platforms**: GitHub (GraphQL) and Azure DevOps (REST), per repository rather than per instance
- **Filtering, sorting, pagination** on every column, plus archived/fork toggles

## Installation

```bash
yarn --cwd packages/backend add @rios0rios0/backstage-plugin-code-health-backend
yarn --cwd packages/app add @rios0rios0/backstage-plugin-code-health
```

### Backend

```ts
// packages/backend/src/index.ts
backend.add(import('@rios0rios0/backstage-plugin-code-health-backend'));
```

That is the whole backend setup. The plugin creates its own tables on first start and registers
three scheduled tasks.

### Frontend — new system (`@backstage/frontend-defaults`)

```ts
// packages/app/src/App.tsx
import codeHealthPlugin from '@rios0rios0/backstage-plugin-code-health/alpha';

export const app = createApp({
  features: [codeHealthPlugin],
});
```

The page mounts at `/code-health`. It emits a title and an icon, from which the app derives a
sidebar entry; an app that places nav items explicitly needs these extension IDs:

| Extension ID | What it is |
|---|---|
| `page:code-health` | The dashboard page |
| `api:code-health/config` | Presentation preferences from `app-config.yaml` |
| `api:code-health/repositories` | The repositories view's data source |
| `api:code-health/contributors` | The contributors view's data source |
| `api:code-health/coverage` | How much history the backend holds |

There is no `nav-item:code-health` to reference.

### Frontend — legacy system (`createApp` from `@backstage/app-defaults`)

```tsx
// packages/app/src/App.tsx
import { CodeHealthPage } from '@rios0rios0/backstage-plugin-code-health';

<Route path="/code-health" element={<CodeHealthPage />} />
```

```tsx
// packages/app/src/components/Root/Root.tsx
import AssessmentIcon from '@material-ui/icons/Assessment';

<SidebarItem icon={AssessmentIcon} to="code-health" text="Code Health" />
```

## Configuration

### Credentials

**There is nothing to configure.** The backend authenticates to each provider through the host
application's existing `integrations` block, per repository URL, so a GitHub App's installation
tokens and an Azure DevOps organisation-scoped credential both work without a second copy.

```yaml
# app-config.yaml — you almost certainly have this already
integrations:
  github:
    - host: 'github.com'
      token: ${GITHUB_TOKEN}
  azure:
    - host: 'dev.azure.com'
      credentials:
        - personalAccessToken: ${AZURE_TOKEN}
```

Required scopes: GitHub `repo` (or `public_repo`) and `read:org`; Azure DevOps **Code (Read)**,
**Build (Read)** and **Project and Team (Read)**.

### Which repositories are tracked

Repositories come from the Backstage catalog. An entity is tracked when it resolves to a supported
repository, in this order:

1. `github.com/project-slug`, as `owner/repo`
2. `dev.azure.com/project-repo` together with `dev.azure.com/host-org`
3. `backstage.io/source-location`, matched against your configured integrations

Backstage's own GitHub and Azure DevOps discovery providers set a source location on everything they
register, so most catalogs need no annotations at all.

```yaml
# app-config.yaml
codeHealth:
  catalog:
    # Defaults to [{ kind: Component }]. Passed straight to the catalog.
    entityFilter:
      - kind: 'Component'
```

### Ingestion

```yaml
codeHealth:
  ingestion:
    retentionDays: 365
    # Day by day. `P7D` finishes the backfill roughly seven times sooner, at the
    # cost of coarser resume granularity when a run is interrupted.
    backfillChunk: 'P1D'
    # Hard ceiling on provider requests per run, per host. When it is spent the
    # run stops and the next one resumes from the same cursors.
    requestBudgetPerRun: 500
    concurrencyPerHost: 4
    schedule:
      frequency: { minutes: 5 }
      timeout: { minutes: 15 }
    discoverySchedule:
      frequency: { minutes: 30 }
      timeout: { minutes: 10 }
    snapshotSchedule:
      frequency: { cron: '0 3 * * *' }
      timeout: { hours: 1 }
```

**How long the first backfill takes.** Roughly three requests per repository per day. With the
defaults — a 500-request budget every five minutes — 500 repositories take about four days to reach
a full year. Raising `backfillChunk` to `P7D` brings that under a day. The dashboard is useful
throughout: the actor collects the recent window before it starts walking backwards, so the last day
is answerable from the first run and wider ranges unlock as the backfill advances.

### Sonar and WakaTime

```yaml
codeHealth:
  sonar:
    # Requires @backstage-community/plugin-sonarqube-backend and a
    # `sonarqube.org/project-key` annotation on the entity.
    enabled: true
  wakaTime:
    organization: 'my-org'
    apiKey: ${WAKATIME_API_KEY}
```

Sonar measures are read from the `sonarqube` backend plugin over Backstage's internal
service-to-service channel, so its token is not duplicated here. That plugin exposes a current
summary per entity and no measures-history passthrough, so **Sonar history cannot be backfilled**:
the trend starts at the first snapshot after installation. The same is true of compliance checks and
README badges — no provider reports what they looked like last March.

### Presentation

```yaml
codeHealth:
  # 60000, 300000, 900000 or 0. Defaults to 300000.
  refreshIntervalMs: 300000
  # hour | day | week | month | quarter | year. Defaults to `day`. A range wider
  # than the backend has ingested falls back to the widest one available.
  defaultRange: 'day'
```

## Operating it

The backend registers three tasks, all `scope: 'global'` so a multi-replica backend runs each of
them once rather than once per replica:

| Task | Default cadence | What it does |
|---|---|---|
| `code-health.discover` | every 30 minutes | Reconciles the tracked repositories with the catalog |
| `code-health.ingest` | every 5 minutes | Moves each forward cursor to now, then backfills with what is left of the budget |
| `code-health.snapshot` | daily at 03:00 | Captures compliance, badges, Sonar, branches, latest release and tag |

Backstage's scheduler exposes a control plane for them:

```bash
curl localhost:7007/api/code-health/.backstage/scheduler/v1/tasks
curl -X POST localhost:7007/api/code-health/.backstage/scheduler/v1/tasks/code-health.ingest/trigger
```

`GET /api/code-health/v1/coverage` reports how far the backfill has got, which repositories are
failing, and the instant every repository has data through.

## Architecture

```
browser                    backstage backend                providers
────────                   ─────────────────                ─────────
code-health           ──▶  /api/code-health/v1/*      ┌──▶  catalog (which repositories)
  no tokens, no crypto       ├─ router (read-only)    │
  one request per load       ├─ store (knex)          ├──▶  Azure DevOps REST 7.1
                             └─ ingestion actor ──────┤
                                  discover  (30 min)  ├──▶  GitHub GraphQL + REST
                                  ingest    ( 5 min)  │
                                  snapshot  (daily)   └──▶  /api/sonarqube, WakaTime
                             credentials: ScmIntegrations
```

Every provider request passes through one gateway that caps concurrency per host, spends a bounded
budget per run, retries `429` and `5xx` with jittered backoff, and opens a circuit breaker on a host
that keeps failing. It reads `Retry-After` and the `X-RateLimit-*` headers on **every** response,
not only on errors — Azure DevOps applies throttling as latency on a successful `200` and sends
those headers before it starts delaying.

## Development

```bash
corepack enable
yarn install
make lint        # ESLint and knip across the workspace
make test        # the whole suite
make sast        # CodeQL, Semgrep, Trivy, Hadolint, Gitleaks
yarn build       # type-check and build all three packages
```

To run the backend on its own, against a mocked catalog:

```bash
yarn workspace @rios0rios0/backstage-plugin-code-health-backend start
curl http://localhost:7007/api/code-health/health
```

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

See [LICENSE](LICENSE) file for details.
