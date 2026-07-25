<h1 align="center">gitforge-dashboard</h1>
<p align="center">
    <a href="https://github.com/rios0rios0/gitforge-dashboard/releases/latest">
        <img src="https://img.shields.io/github/release/rios0rios0/gitforge-dashboard.svg?style=for-the-badge&logo=github" alt="Latest Release"/></a>
    <a href="https://github.com/rios0rios0/gitforge-dashboard/blob/main/LICENSE">
        <img src="https://img.shields.io/github/license/rios0rios0/gitforge-dashboard.svg?style=for-the-badge&logo=github" alt="License"/></a>
    <a href="https://github.com/rios0rios0/gitforge-dashboard/actions/workflows/default.yaml">
        <img src="https://img.shields.io/github/actions/workflow/status/rios0rios0/gitforge-dashboard/default.yaml?branch=main&style=for-the-badge&logo=github" alt="Build Status"/></a>
    <a href="https://www.npmjs.com/package/@rios0rios0/backstage-plugin-gitforge-dashboard">
        <img src="https://img.shields.io/npm/v/@rios0rios0/backstage-plugin-gitforge-dashboard?style=for-the-badge&logo=npm" alt="npm"/></a>
</p>

A [Backstage](https://backstage.io) frontend plugin that shows CI status, releases, tags, compliance
checks and contributor metrics for every repository in a GitHub user or Azure DevOps organization,
enriched with SonarCloud/SonarQube and WakaTime data.

## Features

- **CI status**: aggregated status of each repository's default branch, rendered as a Backstage-themed chip
- **Releases & tags**: latest release with relative date, or the latest tag when no release exists
- **Compliance checks**: pipeline present, build policy on PRs, build policy expiration and branch protection
- **README badge audit**: which of the six standard shields are present in each repository's README
- **Contributor metrics**: approved/total/rejected PRs, lines changed, PR approval rate and pipeline success rate
- **Sonar integration**: bugs, code smells, vulnerabilities, hotspots, coverage, duplications, technical debt and quality gate
- **WakaTime integration**: 30-day coding time and daily average per contributor
- **Two platforms**: GitHub (GraphQL) and Azure DevOps (REST), selected per instance
- **Filtering, sorting, pagination** on every column, plus archived/fork toggles
- **Auto-refresh**: 1 min, 5 min, 15 min or off
- **Two credential modes**: a Backstage `proxy` endpoint (no token in the browser) or per-user tokens
  encrypted with Web Crypto AES-GCM

## Installation

```bash
yarn --cwd packages/app add @rios0rios0/backstage-plugin-gitforge-dashboard
```

Add the page to your app's routes in `packages/app/src/App.tsx`:

```tsx
import { GitforgeDashboardPage } from '@rios0rios0/backstage-plugin-gitforge-dashboard';

const routes = (
  <FlatRoutes>
    {/* ...your other routes... */}
    <Route path="/gitforge" element={<GitforgeDashboardPage />} />
  </FlatRoutes>
);
```

And a sidebar item in `packages/app/src/components/Root/Root.tsx`:

```tsx
import GitHubIcon from '@material-ui/icons/GitHub';

<SidebarItem icon={GitHubIcon} to="gitforge" text="GitForge" />;
```

## Configuration

Everything is optional. With no configuration at all, the plugin renders a setup form where each user
supplies their own organization and tokens.

```yaml
# app-config.yaml
gitforgeDashboard:
  platform: 'github' # or 'azure-devops'
  organization: 'rios0rios0' # GitHub username or Azure DevOps organization
  refreshIntervalMs: 300000 # 60000 | 300000 | 900000 | 0 (off)

  github:
    baseUrl: 'https://api.github.com/graphql' # override for GitHub Enterprise
    proxyPath: '/gitforge-github' # a `proxy.endpoints` key, see below

  azureDevOps:
    baseUrl: 'https://dev.azure.com'
    proxyPath: '/gitforge-ado'

  sonar:
    type: 'cloud' # or 'qube'
    baseUrl: 'https://sonarcloud.io'
    organization: 'rios0rios0'
    proxyPath: '/gitforge-sonar'

  wakaTime:
    baseUrl: 'https://wakatime.com/api/v1'
    proxyPath: '/gitforge-wakatime'
```

Values pinned here always win over what a user sets on the Settings tab, and the corresponding fields
are rendered read-only.

### Credential modes

| Mode | When to use | Where the token lives |
|------|-------------|-----------------------|
| **Proxy** (recommended) | One shared service account for the whole instance | `app-config.yaml` on the backend, never sent to the browser |
| **Per-user token** | Each user sees their own repositories | Encrypted with Web Crypto AES-GCM in the user's own browser |

Configure a `proxyPath` for a target and the plugin routes that target's requests through the
Backstage backend, which attaches the credential. No token is then requested from the user.

```yaml
# app-config.yaml
proxy:
  endpoints:
    '/gitforge-github':
      target: 'https://api.github.com/graphql'
      allowedMethods: ['POST']
      headers:
        Authorization: 'bearer ${GITHUB_TOKEN}'

    '/gitforge-ado':
      target: 'https://dev.azure.com'
      allowedMethods: ['GET']
      headers:
        Authorization: 'Basic ${AZURE_DEVOPS_BASIC_AUTH}' # base64 of ":<PAT>"

    '/gitforge-sonar':
      target: 'https://sonarcloud.io'
      allowedMethods: ['GET']
      headers:
        Authorization: 'Bearer ${SONAR_TOKEN}'

    '/gitforge-wakatime':
      target: 'https://wakatime.com/api/v1'
      allowedMethods: ['GET']
      headers:
        Authorization: 'Bearer ${WAKATIME_API_KEY}'
```

Without a proxy, requests go straight from the browser to each provider. GitHub's GraphQL API sends
permissive CORS headers, so it works; Azure DevOps, Sonar and WakaTime generally do not, which is why
the proxy is recommended for those.

### Required token scopes

| Provider | Scope |
|----------|-------|
| GitHub | fine-grained PAT with **Metadata (read-only)**; add **Contents (read-only)** for the README badge audit and **Administration (read-only)** for branch protection |
| Azure DevOps | PAT with **Code (read)**, **Build (read)** and **Project and team (read)** |
| SonarCloud / SonarQube | user token with **Execute Analysis** not required; read access is enough |
| WakaTime | API key of a user who can read the organization's dashboards |

## Exports

| Export | Description |
|--------|-------------|
| `gitforgeDashboardPlugin` | The plugin instance, for `bindRoutes` and API overrides |
| `GitforgeDashboardPage` | Routable extension rendering the whole dashboard |
| `rootRouteRef`, `contributorsRouteRef`, `settingsRouteRef` | Route refs for external routing |
| `gitforgeDashboardApiRef`, `gitforgeContributorsApiRef` | Data APIs, overridable with your own implementation |
| `gitforgeAuthApiRef`, `gitforgeConfigApiRef` | Credential store and resolved app-config |

Every domain entity (`Repository`, `Contributor`, `ComplianceStatus`, …) is exported as a type.

## Architecture

5-layer [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
where dependencies always point inward toward the Domain layer.

```
src/
├── plugin.ts         # createPlugin + createRoutableExtension
├── routes.ts         # rootRouteRef and its sub-routes
├── domain/           # Entities and contracts (ports); no framework imports
│   ├── entities/     #   Repository, Contributor, ComplianceStatus, GitforgeConfig, …
│   ├── repositories/ #   RepositoryRepository, ComplianceRepository, SonarRepository, …
│   └── services/     #   DashboardService, ContributorService, AuthenticationService
├── service/          # Business logic, platform mappers, settings resolution
│   └── mappers/      #   GraphQL/ADO payload → domain entity
├── infrastructure/   # Backstage fetchApi clients, proxy-aware endpoint resolution, crypto
│   ├── crypto/       #   AES-GCM key store and helpers
│   ├── http/         #   EndpointResolver + GraphQL/ADO/Sonar/WakaTime clients
│   ├── repositories/ #   GitHub and Azure DevOps implementations
│   └── services/     #   Encrypted credential store, app-config reader
├── presentation/     # Material UI components, hooks and pages
│   ├── components/   #   DataTable, StateChip, IntegrationCard, AuthGate, …
│   ├── hooks/        #   useRepositories, useContributors, useAutoRefresh, useTheme
│   └── pages/        #   DashboardPage, ContributorsPage, SettingsPage
└── main/             # Backstage utility APIs and dependency injection
    ├── api_refs.ts   #   ApiRef tokens
    ├── apis.ts       #   createApiFactory wiring
    ├── router.tsx    #   Page/Header/TabbedLayout composition
    └── factories/    #   Repository and service factories
```

The two data APIs rebuild their object graph on every call, so switching platform or updating a token
on the Settings tab takes effect immediately without reloading the page.

## Development

```bash
corepack enable        # Enable Yarn Berry via corepack (first time only)
yarn install           # Install dependencies
yarn build             # Emit dist/ (ES module + type declarations)
yarn test              # Run tests
yarn test:watch        # Watch mode for TDD
yarn typecheck         # Type-check without emitting
```

Quality gates (always use `make` targets — never run tools directly):

```bash
make lint              # Run ESLint via pipeline scripts
make test              # Run Vitest with coverage via pipeline scripts
make sast              # Run full SAST suite (CodeQL, Semgrep, Trivy, Hadolint, Gitleaks)
```

To try the plugin end to end, `yarn link` this package into a Backstage app and follow the
installation steps above.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE)
