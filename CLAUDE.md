# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A [Backstage](https://backstage.io) frontend plugin published as `@rios0rios0/backstage-plugin-code-health`.
It displays CI workflow status, releases, tags, compliance checks and contributor metrics for
repositories from GitHub (GraphQL API) and Azure DevOps (REST API), enriched with SonarCloud/SonarQube
and WakaTime data. There is no backend of its own: requests either go straight from the browser to each
provider, or through a Backstage `proxy` endpoint when one is configured.

## Commands

```bash
corepack enable        # Enable Yarn Berry via corepack (first time only)
yarn install           # Install dependencies
yarn build             # tsc + backstage-cli package build -> dist/
yarn typecheck         # Type-check and emit dist-types/ (input to the build)
make lint              # Run ESLint via pipeline scripts
make test              # Run Jest via pipeline scripts
make sast              # Run full SAST suite (CodeQL, Semgrep, Trivy, Hadolint, Gitleaks)
```

**Never run `eslint`, `jest`, or SAST tools directly.** Always use `make` targets which invoke the
[rios0rios0/pipelines](https://github.com/rios0rios0/pipelines) scripts.

This package is a library, so there is no dev server. To exercise it, `yarn build && yarn link` and
link it into a Backstage app.

## Architecture

5-Layer Frontend Clean Architecture. Dependencies always point inward toward Domain.

```
src/plugin.ts         → createPlugin + createRoutableExtension
src/routes.ts         → rootRouteRef and its sub-routes
src/domain/           → Entities, contracts (ports), pure filter/sort functions
src/service/          → Business logic, platform mappers, settings resolution
src/infrastructure/   → fetchApi-based clients, proxy-aware endpoint resolution, AES-GCM crypto
src/presentation/     → Material UI components, hooks, pages
src/main/             → Backstage utility APIs, ApiRefs, DI wiring, router
```

### Key Files

| File | Purpose |
|------|---------|
| `config.d.ts` | Backstage config schema for the `codeHealth` key (no secrets, frontend-visible only) |
| `src/plugin.ts` | Plugin definition and the `CodeHealthPage` routable extension |
| `src/main/api_refs.ts` | The four `ApiRef` tokens the plugin exposes |
| `src/main/apis.ts` | `createApiFactory` wiring; builds the HTTP clients from `fetchApi` + `discoveryApi` |
| `src/main/router.tsx` | `Page`/`Header`/`TabbedLayout` composition and the setup gate |
| `src/main/code_health_repositories_api.ts` | `DashboardService` implementation; rebuilds its object graph per call |
| `src/main/code_health_contributors_api.ts` | `ContributorService` implementation |
| `src/service/settings_resolver.ts` | Merges app-config over user settings; decides whether a token is needed |
| `src/infrastructure/http/endpoint_resolver.ts` | Chooses between a direct base URL and a Backstage proxy path |
| `src/infrastructure/services/backstage_config_service.ts` | Reads `codeHealth` into the `CodeHealthConfig` entity |
| `src/infrastructure/services/deferred_authentication_service.ts` | Makes the async encrypted store usable as a synchronous utility API |
| `src/infrastructure/services/encrypted_authentication_service.ts` | Web Crypto AES-GCM encrypted token storage |
| `src/domain/entities/dashboard_filter.ts` | Filter/sort logic (pure functions, no side effects) |
| `src/domain/entities/compliance_status.ts` | Compliance check entity and color computation logic |
| `src/presentation/components/data_table.tsx` | Shared TanStack + Material UI table renderer |

### Conventions

- **snake_case** for all file names
- **No `any`** — use `unknown` with type narrowing
- **BDD tests** with `// given`, `// when`, `// then` blocks
- **Stubs over Mocks** — test doubles in `test/doubles/`
- **Builders** for test data — `test/builders/repository_builder.ts`
- Material UI **v4** (`@material-ui/core`), matching what `@backstage/core-components` uses
- React **18** and `react-router-dom` **v6**, matching the Backstage peer ranges

## Testing

A comprehensive test suite covers domain logic, service layer, infrastructure, and presentation
components. All tests run on Jest through `backstage-cli package test`, with Testing Library and
`TestApiProvider` from `@backstage/test-utils` for the few components that resolve a Backstage
utility API. Tests live in `test/`, wired in through the `jest.roots` override in `package.json`.

Coverage thresholds enforced at 90%+ lines/functions/statements and 77%+ branches. CI posts a coverage
PR comment, test result annotations, and uploads the HTML coverage report as an artifact.

```bash
make test              # Full suite (ALWAYS use this)
yarn test              # Quick check during development
yarn test:watch        # Watch mode for TDD
```

The toolchain is the Backstage CLI end to end: `backstage-cli package build`, `package lint`
(ESLint 8 via `.eslintrc.js` and `@backstage/cli/config/eslint-factory`) and `package test` (Jest).

## Release

CI runs `rios0rios0/pipelines/.github/workflows/yarn-library.yaml` on every push and pull request.
There is no deployment target — the artifact is the npm package.

Releasing follows the changelog process:

1. Branch `bump/x.x.x`, move `[Unreleased]` into a dated version heading and set the same
   version in `package.json`.
2. Open a PR to `main`. The merge commit must carry `chore/bump-x.x.x` or
   `chore(bump): ...version to x.x.x` — that string is what the pipeline matches on.
3. On merge, `delivery-release` (from the shared workflow) cuts the tag and GitHub Release,
   and `delivery-publish` (in `.github/workflows/default.yaml`) publishes to npm.

`delivery-publish` is repo-local because publishing to a registry is not part of any of the
shared `*-library.yaml` workflows. It runs only after the quality gate passes, publishes with
`npm publish --provenance` so the tarball is attested to the workflow run, and no-ops when the
version is already on the registry — which is what makes the tag-push recovery path safe to
re-run.

### Authentication — trusted publishing (OIDC)

**There is no `NPM_TOKEN` secret, and there must not be one.** The job authenticates with npm
through OIDC trusted publishing: GitHub mints a short-lived id-token for the run, npm exchanges
it for a credential scoped to this repository and this workflow file, and nothing long-lived is
ever stored. This is not merely preferable, it is the only automated path with a future — npm
revoked all classic tokens in December 2025, capped write-scoped granular tokens at 90 days, and
2FA-bypass tokens (the only kind usable unattended) lose the ability to publish around January
2027.

The trust relationship is configured once, out of band, and npm requires the package to already
exist before it will accept one:

```bash
npm login                                          # 2FA, 2-hour session
npm publish --provenance --access public           # first version only, from a workstation
npm trust github --workflow default.yaml           # then wire up CI
npm trust list                                     # verify
```

Publishing must be pinned to the `rios0rios0/code-health` repository and the `default.yaml`
workflow filename. Renaming that workflow file breaks publishing until the trust entry is
updated.

For a stricter posture, a trust relationship can be made **stage-only**: CI then runs
`npm stage publish`, the version is held privately, and a maintainer releases it with
`npm stage approve <stage-id>` under 2FA. That trades the hands-off release for a human
checkpoint; the current setup publishes directly.
