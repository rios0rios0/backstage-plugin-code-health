# gitforge-dashboard

gitforge-dashboard is a [Backstage](https://backstage.io) frontend plugin published as `@rios0rios0/backstage-plugin-gitforge-dashboard`. It displays CI workflow status, releases, tags, compliance checks, and contributor metrics across repositories from GitHub (GraphQL API) and Azure DevOps (REST API). It also integrates with SonarCloud and WakaTime for additional metrics. It has no backend of its own: requests go straight from the browser to each provider, or through a Backstage `proxy` endpoint when one is configured.

Always reference these instructions first and fall back to search or bash commands only when you encounter unexpected information that does not match the info here.

## Working Effectively

### Bootstrap and Test

- Enable Yarn Berry: `corepack enable` (first time only)
- Install dependencies: `yarn install`
- Build the library: `yarn build` (emits `dist/`; there is no dev server, this package is a library)
- Type-check only: `yarn typecheck`
- Run tests: `make test` -- NEVER run `vitest` directly.
- Run linting: `make lint` -- NEVER run `eslint` directly.
- Run security analysis: `make sast` -- NEVER run `gitleaks`, `semgrep`, `trivy`, `hadolint`, or `codeql` directly.

### Linting, Testing, and SAST with Makefile

This project uses the [rios0rios0/pipelines](https://github.com/rios0rios0/pipelines) repository for shared CI/CD scripts. The `Makefile` imports these scripts via `SCRIPTS_DIR`. Always use `make` targets:

```bash
make lint    # ESLint via pipeline scripts
make test    # Vitest via pipeline scripts
make sast    # CodeQL, Semgrep, Trivy, Hadolint, Gitleaks
```

## Architecture

The project follows **5-Layer Frontend Clean Architecture** with dependencies always pointing inward toward the Domain layer.

### Source Structure

Dependencies always point inward toward Domain. Use `ls` for the full file listing.

```
src/domain/           → Entities, contracts (ports), pure filter/sort functions
src/service/          → Business logic, platform-specific mappers (GitHub GraphQL + ADO REST)
src/infrastructure/   → GitHub GraphQL & ADO REST clients, Web Crypto AES-GCM encrypted auth
src/presentation/     → Material UI components, hooks, pages (dashboard, contributors, settings)
src/main/             → Backstage utility APIs, ApiRefs, DI wiring, router
src/plugin.ts         → createPlugin + createRoutableExtension
src/routes.ts         → rootRouteRef and its sub-routes
config.d.ts           → Backstage config schema for the `gitforgeDashboard` key
test/                 → Mirrors src/ structure; builders/ for test data, doubles/ for stubs
```

### Layer Responsibilities

| Layer              | Directory              | Responsibility                                                                    |
|--------------------|------------------------|-----------------------------------------------------------------------------------|
| **Domain**         | `src/domain/`          | Entity interfaces, service/repository contracts, pure filter/sort functions       |
| **Service**        | `src/service/`         | Business logic orchestration, platform-specific mappers                           |
| **Infrastructure** | `src/infrastructure/`  | `fetchApi` clients, proxy-aware endpoint resolution, encrypted auth, config reader |
| **Presentation**   | `src/presentation/`    | Material UI components, hooks, pages — services arrive through props              |
| **Main**           | `src/main/`            | Backstage `ApiRef`s, `createApiFactory` wiring, router, factories                  |

### Key Design Decisions

- **Multi-platform**: Supports GitHub (GraphQL) and Azure DevOps (REST) via Adapter pattern. DI factories create platform-specific repositories and services at runtime.
- **GraphQL over REST (GitHub)**: A single GraphQL query fetches CI status + latest release + latest tag for up to 100 repos.
- **Two credential modes**: a Backstage `proxy` endpoint (the backend attaches the credential, nothing reaches the browser) or per-user PATs entered at runtime and encrypted with Web Crypto AES-GCM before storage in `localStorage`. `src/service/settings_resolver.ts` decides which applies.
- **Config over user settings**: values pinned under `gitforgeDashboard` in `app-config.yaml` always win and render read-only.
- **Utility APIs**: the plugin exposes four `ApiRef`s so an integrator can replace any of them; the data APIs rebuild their object graph per call so settings changes take effect immediately.
- **No external state management**: State is managed locally in React hooks (`useState`, `useEffect`). No Redux, Zustand, or similar libraries.
- **snake_case file names**: All source files use `snake_case`.

### External APIs

- **GitHub GraphQL**: Core query fetches repository data with CI status via `statusCheckRollup`, latest release via `latestRelease`, and latest tag via `refs(refPrefix: "refs/tags/")`. Cursor-based pagination via `pageInfo`.
- **Azure DevOps REST**: Batched parallel fetching for repositories, CI status, tags, and contributors.
- **SonarCloud / WakaTime**: Optional integrations for code quality metrics and development activity.

## Testing

### Standards

- All tests follow **BDD** structure with `// given`, `// when`, `// then` comment blocks.
- Test descriptions use `"should ... when ..."` format.
- Tests use **Stubs** and **In-memory doubles** over Mocks.
- Test data is constructed via **Builders** (`test/builders/repository_builder.ts`).

### Running Tests

```bash
make test             # Full test suite via pipeline scripts (ALWAYS use this)
yarn test             # Quick test check during development (acceptable)
yarn test:watch       # Watch mode for TDD
```

## Validation

### After Making Changes

1. `yarn build` -- must type-check and emit `dist/` with zero errors
2. `make lint` -- must report 0 issues
3. `make test` -- all tests must pass
4. `make sast` -- should report no new findings

### Pre-commit

- Always run `make lint` before committing (CI will fail otherwise).
- Always run `make test` to ensure no regressions.
- Always run `make sast` to catch security issues.

## Build and Test Timing Expectations

- **Type check** (`tsc -b`): <3 seconds.
- **Tests** (`vitest run`): ~50 seconds (413 tests).
- **Build** (`tsc -p tsconfig.build.json && vite build`): <10 seconds.
- **Lint**: ~2-3 seconds.
- **SAST**: ~1-3 minutes.

## Common Development Commands

```bash
# Full validation cycle
yarn build && make lint && make test

# Quick test cycle during development
yarn test

# Full security + quality gate
make lint && make test && make sast

# Try the plugin in a real Backstage app
yarn build && yarn link
```
