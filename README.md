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
- **Contributor metrics**: commits, code churn, pull requests created and pull requests approved as separate columns, review approval rate and pipeline success rate — every rate explains what it divides in a tooltip on its heading
- **Honest churn units**: GitHub reports added and deleted lines; Azure DevOps reports changed files and exposes no line count anywhere in its API, so each row prints the unit its provider actually gave rather than showing zero
- **Insights**: the landing tab, with the fleet-level figures and charts — delivery cadence, top contributors, most active repositories, review load, quality-gate and branch-policy breakdowns, test-coverage distribution, and the documentation and catalog-API gaps
- **Catalog links**: repository rows and contributors link through to their catalog entity, and a contributor matched to a `User` shows that entity's name and picture
- **Sonar integration** through the community `sonarqube` backend plugin, so its token stays where that plugin already keeps it
- **One row per person, not per account**: commits arrive under a commit e-mail or a login, coding time under a WakaTime username, tickets under an Atlassian account id. The **Identities** tab links them, so a contributor row adds up — and because links are applied when a row is built, correcting one fixes last March's numbers too
- **WakaTime integration**: coding time, active days, language and editor breakdowns, branches touched, files opened, and — where WakaTime's editor plugins report them — **AI token counts and the share of lines written by AI rather than typed**. It is the only source here that measures effort rather than output, and the only one that can see the difference between a line typed and a line accepted from a completion
- **Jira integration**: tickets created and closed, interactions, story points estimated and finished, cycle and lead time, throughput, bug ratio, rework, and the open backlog by priority and age
- **Confluence integration**: pages created and edited, words written, comments, attachments, spaces contributed to, stale-page counts, and page views on Premium sites. One Atlassian credential lights up both products
- **Documentation audit**: which repositories publish TechDocs, which already write documentation nobody wired up, and which have none
- **Catalog API audit**: repositories shipping an OpenAPI, AsyncAPI, GraphQL or protobuf definition that declare no `spec.providesApis`
- **A year of history**: pick any rolling window from the last hour to the last 365 days, today so far, or any single calendar month
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

### Sonar, WakaTime and Atlassian

```yaml
codeHealth:
  sonar:
    # Requires @backstage-community/plugin-sonarqube-backend and a
    # `sonarqube.org/project-key` annotation on the entity.
    enabled: true

  wakaTime:
    # Optional. Without it the key's own account is measured, which is what a
    # small team on personal plans wants.
    organization: 'my-org'
    apiKey: ${WAKATIME_API_KEY}
    historyDays: 30
    # Token counts and AI-versus-human authorship. Off by default: coding time
    # for a whole window costs one request per member, while these cost one per
    # member per day.
    includeAiMetrics: false

  # One credential, both products.
  atlassian:
    baseUrl: 'https://acme.atlassian.net'
    email: ${ATLASSIAN_EMAIL}
    apiToken: ${ATLASSIAN_API_TOKEN}
    historyDays: 90
    jira:
      enabled: true
    confluence:
      enabled: true
```

Every integration is absent by default, and the frontend asks the backend which ones are configured
before it draws anything. That is why a column for a switched-off integration is never built rather
than being built and left empty: an integration configured this morning has collected nothing until
the nightly pass, and a dashboard that hides its columns until then looks broken rather than new.

Sonar measures are read from the `sonarqube` backend plugin over Backstage's internal
service-to-service channel, so its token is not duplicated here. That plugin exposes a current
summary per entity and no measures-history passthrough, so **Sonar history cannot be backfilled**:
the trend starts at the first snapshot after installation. The same is true of compliance checks and
README badges — no provider reports what they looked like last March. WakaTime and Jira *can* be
backfilled and are stored a day at a time, so a range picked over a past month gets a real answer
rather than a trailing window relabelled with that month's dates.

Jira and Confluence scope themselves to a repository through annotations on its catalog entity:

```yaml
metadata:
  annotations:
    jira/project-key: PLAT
    confluence.io/space-key: ENG
    # Only needed when the WakaTime project is not named after the repository.
    wakatime.com/project: platform-gateway
```

Each integration has its own reference, covering exactly what is measured, how each number is
derived, what the provider cannot answer and why:

- [WakaTime](plugins/code-health-backend/docs/wakatime.md)
- [Jira](plugins/code-health-backend/docs/jira.md)
- [Confluence](plugins/code-health-backend/docs/confluence.md)

### Identities — making a contributor row a person

Every system identifies people differently, and only a shared e-mail address joins any two of them
on its own. The **Identities** tab lists every account the plugin has seen, which catalog `User` it
resolved to, and a ranked list of who else it might be.

An account whose address matches a `User` profile is linked automatically — that is the same rule
the catalog itself uses. Everything weaker (a shared address before the `@`, an identical display
name, a username that matches the directory address, a partial name match) is *offered* and linked
only when somebody confirms it. **Nothing is merged on a name resemblance alone**: two people who
share a surname would silently become one contributor, and a merge nobody asked for is far harder to
notice than a row that stayed separate. A manual link is never overwritten by the automatic rule.

Links are applied when a row is built rather than when a measurement is taken, so correcting one is
retroactive across every window the plugin has ever collected. An account nobody has linked keeps a
row of its own — hiding it would hide every bot, every service account, and everybody nobody has got
round to linking, which are exactly the rows that show the work is not finished.

### Presentation

```yaml
codeHealth:
  # 60000, 300000, 900000 or 0. Defaults to 300000.
  refreshIntervalMs: 300000
  # today | hour | day | week | month | quarter | year. Defaults to `day`. A
  # range wider than the backend has ingested falls back to the widest one
  # available. `today` is the local calendar day so far; `day` is the last 24
  # hours. A specific calendar month cannot be pinned here — it would be a fixed
  # month that goes stale the moment it passes.
  defaultRange: 'day'
```

Every tab shares one range control. It offers the rolling ranges above and, under **By month…**, any
single calendar month the backfill has reached: arrows step a month at a time, and the month and year
dropdowns jump anywhere. Months outside the ingested history stay visible but unselectable, so a gap
reads as "not collected yet" rather than as a list that mysteriously starts in April.

The Insights tab has no settings of its own. Its cadence chart buckets by day, week or month
according to the range already selected — a year of daily points is noise and a week of monthly
ones is a single dot, so the only correct setting is implied by the range and is not offered as a
second control.

### What the documentation and API audits read

Both grades combine what the catalog entity says with what the repository contains, so the daily
snapshot has to have run at least once before either reports anything — until then they read
"not measured" rather than "nothing found".

| Signal | Where it comes from |
|---|---|
| Published documentation | `backstage.io/techdocs-ref` on the entity |
| Documentation sources | a `docs/` tree or an `mkdocs.yml` in the repository |
| External documentation | a `metadata.links` entry whose type or title names docs or a wiki |
| Declared APIs | `spec.providesApis` on the entity |
| API definition | `openapi`, `swagger`, `asyncapi`, `api`, a GraphQL schema or a `.proto`, at the root or under `docs/` or `api/` |

The file scan is deliberately shallow — the root, `docs/` and `api/`. It costs no extra request on
GitHub, where the trees ride along in the snapshot's existing GraphQL document, and one listing per
repository per day on Azure DevOps, plus one more for each of those two directories that exists. A
README on its own does not count as documentation: nearly every repository has one, so counting it
would grade the whole fleet documented and the metric would measure nothing.

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
