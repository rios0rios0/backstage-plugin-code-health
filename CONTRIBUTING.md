# Contributing

Contributions are welcome. By participating, you agree to maintain a respectful and constructive environment.

For coding standards, testing patterns, architecture guidelines, commit conventions, and all
development practices, refer to the **[Development Guide](https://github.com/rios0rios0/guide/wiki)**.

## Prerequisites

- Node.js 20+
- [Corepack](https://nodejs.org/api/corepack.html) (ships with Node.js 16.13+)
- [Make](https://www.gnu.org/software/make/)
- A [Backstage](https://backstage.io) app to try the plugins in (optional, but recommended)

## Repository Layout

This is a Yarn workspaces monorepo. The root package is private and drives the workspace; the three
publishable packages live under `plugins/`.

```
plugins/
  code-health/           @rios0rios0/backstage-plugin-code-health          (frontend-plugin)
  code-health-backend/   @rios0rios0/backstage-plugin-code-health-backend  (backend-plugin)
  code-health-common/    @rios0rios0/backstage-plugin-code-health-common   (common-library)
```

All three carry the same version and are bumped together, because the frontend and the backend share
a wire contract that only makes sense as one release.

## Development Workflow

1. Fork and clone the repository
2. Create a branch: `git checkout -b feat/my-change`
3. Install dependencies:
   ```bash
   corepack enable
   yarn install
   ```
4. Make your changes
5. Validate:
   ```bash
   make lint
   make test
   make sast
   ```
6. Update `CHANGELOG.md` under `[Unreleased]`
7. Commit following the [commit conventions](https://github.com/rios0rios0/guide/wiki/Git-Flow)
8. Open a pull request against `main`

The toolchain is the Backstage CLI end to end. The root scripts use its workspace commands
(`backstage-cli repo lint | test | build`), which is what keeps the merged coverage report and
`junit-report.xml` at the repository root where the shared pipeline reads them.

### Running the backend on its own

```bash
yarn workspace @rios0rios0/backstage-plugin-code-health-backend start
curl http://localhost:7007/api/code-health/health
curl -X POST http://localhost:7007/api/code-health/.backstage/scheduler/v1/tasks/code-health.discover/trigger
```

`plugins/code-health-backend/dev/index.ts` wires a minimal backend with a mocked catalog and mocked
auth, so nothing real is contacted unless you point it at a real integration.

### Trying a change in a real app

```bash
yarn build
yarn workspaces foreach -A pack
```

Install the resulting tarballs into an app that already has `integrations.github` or
`integrations.azure` configured and a populated catalog. Both plugins must be installed: the
frontend reports the backend as missing rather than showing an empty dashboard.

## Testing

Tests live in a `test/` directory beside each package's `src/`, mirroring its structure.

- **No mock libraries.** Doubles are hand-written in `test/doubles/`, builders in `test/builders/`.
- **BDD structure**: `// given`, `// when`, `// then` in every test.
- **The store is tested against a real database** through `TestDatabases`, with the real migrations
  applied. A double would happily accept a column the migration never created.
- **Collectors and the HTTP gateway are tested against a real `http.createServer`**, so the query
  strings they build are parsed by an actual HTTP stack. That is the layer where the interesting
  mistakes live — a missing `queryOrder`, a `status` left at its default.
- **The plugin is tested through `startTestBackend`** with `supertest`, exercising real routing,
  real migrations and the real scheduler.

Coverage thresholds are enforced repo-wide at 95% lines and statements, 92% functions and 88%
branches. Write the test rather than adding a `collectCoverageFrom` exclusion.

## Adding a New Platform

Provider access sits behind two ports, so a new forge is an implementation and a map entry:

1. Add the identifier to `Platform` in `plugins/code-health-common/src/platform.ts`
2. Implement `VcsCollector` under
   `plugins/code-health-backend/src/infrastructure/services/collectors/`, taking the
   `ProviderGateway` and a `CredentialsResolver` in its constructor. Every request must go through
   the gateway — that is what bounds the load on the provider
3. Teach `IntegrationsCredentialsResolver` how to build its headers, preferring whatever
   `@backstage/integration` already exposes for that forge
4. Add the entry to the `collectors` map in `plugins/code-health-backend/src/plugin.ts`. Nothing
   else in the ingestion path needs editing
5. Extend `AnnotationRepositoryResolver` so catalog entities for that forge resolve
6. Add tests following the [testing guide](https://github.com/rios0rios0/guide/wiki/Tests)
7. Update `CHANGELOG.md` with an entry under `[Unreleased] > Added`

## Releasing

Follow the changelog process: branch `bump/x.x.x`, move `[Unreleased]` into a dated version heading,
and set the same version in **all three** `package.json` files. The merge commit must carry
`chore/bump-x.x.x` or `chore(bump): ...version to x.x.x` — that string is what the pipeline matches
on.

A new package name needs its own npm trusted-publishing entry before it can ship; `npm trust` has no
update verb, so this is done once, out of band, with npm 11.5.1 or newer:

```bash
npm trust github @rios0rios0/backstage-plugin-code-health-backend \
  --file default.yaml --repo rios0rios0/backstage-plugin-code-health --allow-publish
npm trust github @rios0rios0/backstage-plugin-code-health-common \
  --file default.yaml --repo rios0rios0/backstage-plugin-code-health --allow-publish
```
