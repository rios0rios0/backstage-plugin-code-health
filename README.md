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
yarn --cwd packages/app add @rios0rios0/backstage-plugin-code-health
```

The plugin ships two entry points. Use the one that matches your app.

### New frontend system (`@backstage/frontend-defaults`)

Import the default export from `/alpha` and add it to `features` in
`packages/app/src/App.tsx`:

```tsx
import { createApp } from '@backstage/frontend-defaults';
import codeHealthPlugin from '@rios0rios0/backstage-plugin-code-health/alpha';

export default createApp({
  features: [
    /* ...your other plugins... */
    codeHealthPlugin,
  ],
});
```

The page mounts at `/code-health` and emits a title and icon, which is what the new frontend
system derives a nav entry from, so it appears in the sidebar automatically — no `Sidebar.tsx`
change needed.

Apps that replace the sidebar with their own `NavContentBlueprint` are the exception: those
place items explicitly and must not filter this one out. The extension IDs to reference are

| Extension | ID |
|-----------|-----|
| Page | `page:code-health` |
| APIs | `api:code-health/auth`, `api:code-health/config`, `api:code-health/repositories`, `api:code-health/contributors` |

so `nav.take('page:code-health')` places it by hand and `app.extensions` can override it by
the same ID. There is no `nav-item:code-health` — `NavItemBlueprint` no longer exists in
`@backstage/frontend-plugin-api`.

### Legacy frontend system (`createApp` from `@backstage/app-defaults`)

Add the page to your routes in `packages/app/src/App.tsx`:

```tsx
import { CodeHealthPage } from '@rios0rios0/backstage-plugin-code-health';

const routes = (
  <FlatRoutes>
    {/* ...your other routes... */}
    <Route path="/code-health" element={<CodeHealthPage />} />
  </FlatRoutes>
);
```

And a sidebar item in `packages/app/src/components/Root/Root.tsx`:

```tsx
import AssessmentIcon from '@material-ui/icons/Assessment';

<SidebarItem icon={AssessmentIcon} to="code-health" text="Code Health" />;
```

## Configuration

Everything is optional. With no configuration at all, the plugin renders a setup form where each user
supplies their own organization and tokens.

```yaml
# app-config.yaml
codeHealth:
  platform: 'github' # or 'azure-devops'
  organization: 'rios0rios0' # GitHub username or Azure DevOps organization
  refreshIntervalMs: 300000 # 60000 | 300000 | 900000 | 0 (off)

  github:
    baseUrl: 'https://api.github.com/graphql' # override for GitHub Enterprise
    proxyPath: '/code-health-github' # a `proxy.endpoints` key, see below

  azureDevOps:
    baseUrl: 'https://dev.azure.com'
    proxyPath: '/code-health-ado'

  sonar:
    type: 'cloud' # or 'qube'
    baseUrl: 'https://sonarcloud.io'
    organization: 'rios0rios0'
    proxyPath: '/code-health-sonar'

  wakaTime:
    baseUrl: 'https://wakatime.com/api/v1'
    proxyPath: '/code-health-wakatime'
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
    '/code-health-github':
      target: 'https://api.github.com/graphql'
      allowedMethods: ['POST']
      headers:
        Authorization: 'bearer ${GITHUB_TOKEN}'

    '/code-health-ado':
      target: 'https://dev.azure.com'
      allowedMethods: ['GET']
      headers:
        Authorization: 'Basic ${AZURE_DEVOPS_BASIC_AUTH}' # base64 of ":<PAT>"

    '/code-health-sonar':
      target: 'https://sonarcloud.io'
      allowedMethods: ['GET']
      headers:
        Authorization: 'Bearer ${SONAR_TOKEN}'

    '/code-health-wakatime':
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
| `codeHealthPlugin` | The plugin instance, for `bindRoutes` and API overrides (legacy system) |
| default export of `/alpha` | The same plugin for the declarative frontend system |
| `CodeHealthPage` | Routable extension rendering the whole dashboard |
| `rootRouteRef`, `contributorsRouteRef`, `settingsRouteRef` | Route refs for external routing |
| `codeHealthRepositoriesApiRef`, `codeHealthContributorsApiRef` | Data APIs, overridable with your own implementation |
| `codeHealthAuthApiRef`, `codeHealthConfigApiRef` | Credential store and resolved app-config |

Every domain entity (`Repository`, `Contributor`, `ComplianceStatus`, …) is exported as a type.

## Architecture

5-layer [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
where dependencies always point inward toward the Domain layer.

```
src/
├── plugin.ts         # createPlugin + createRoutableExtension
├── routes.ts         # rootRouteRef and its sub-routes
├── domain/           # Entities and contracts (ports); no framework imports
│   ├── entities/     #   Repository, Contributor, ComplianceStatus, CodeHealthConfig, …
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
yarn build             # tsc + backstage-cli package build -> dist/
yarn test              # Run Jest via backstage-cli
yarn test:watch        # Watch mode for TDD
yarn typecheck         # Type-check and emit dist-types/
```

Quality gates (always use `make` targets — never run tools directly):

```bash
make lint              # Run ESLint via pipeline scripts
make test              # Run Jest with coverage via pipeline scripts
make sast              # Run full SAST suite (CodeQL, Semgrep, Trivy, Hadolint, Gitleaks)
```

The package is built with the Backstage CLI (`backstage-cli package build`), so it produces the
standard `dist/index.esm.js` + `dist/index.d.ts` layout every Backstage plugin ships. To try it end
to end, `yarn link` this package into a Backstage app and follow the installation steps above.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE)
