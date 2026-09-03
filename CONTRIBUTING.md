# Contributing

Contributions are welcome. By participating, you agree to maintain a respectful and constructive environment.

For coding standards, testing patterns, architecture guidelines, commit conventions, and all
development practices, refer to the **[Development Guide](https://github.com/rios0rios0/guide/wiki)**.

## Prerequisites

- Node.js 20+
- [Corepack](https://nodejs.org/api/corepack.html) (ships with Node.js 16.13+)
- [Make](https://www.gnu.org/software/make/)
- [chlog](https://github.com/luizjhonata/chlog) (`go install github.com/luizjhonata/chlog@latest`)
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
6. Add a changelog fragment — never edit `CHANGELOG.md`, which is generated from them:
   ```bash
   chlog new --kind Added --body "added the thing that was not there before"
   ```
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
7. Add a changelog fragment: `chlog new --kind Added --body "added support for <platform>"`

## Releasing

Releases are cut with [AutoBump](https://github.com/rios0rios0/autobump), which reads `[Unreleased]`,
works out the next version from it, moves those entries under a dated heading, writes the version to
every `package.json`, and opens the pull request:

```bash
autobump .
```

Requires AutoBump 3.0.0 or newer. No `-c` is needed: AutoBump reads your own configuration from
`$HOME`, and this repository's `.autobump.yaml` is the last of four configuration layers, merged on
top of yours rather than mistaken for it.

`refresh: true` under `languages.typescript` now lives in this repository's own `.autobump.yaml`,
beside the pattern that makes it necessary. The refresh regenerates `yarn.lock` inside the bump
commit: the bump moves a caret range that is also a resolution descriptor in the lockfile, and
without it every CI job's `yarn install --immutable` answers `YN0028`.

**Interim, until `rios0rios0/autobump#348` is released:** on 3.0.2 — the latest tag, cut before that
PR — a project file's `refresh: true` is warned about and dropped, so you still need the same line in
your own `~/.autobump.yaml`. Delete the old `refresh_commands` block if you have one: 3.0.0 onwards
recognises the removed key by name and aborts rather than ignoring it. See `CLAUDE.md` > Release.

`.autobump.yaml` adds `plugins/*/package.json` to the version files AutoBump knows about. Its
TypeScript defaults cover only the root `package.json`, which in this workspace is private and never
published, so without that entry a release would leave all three packages on the previous version
and fail `delivery-publish`'s tag-versus-`package.json` guard.

The version follows from how the changelog entries are written: an entry that **begins** with
`- **BREAKING CHANGE:**` makes it a major release, anything under `### Added` a minor one, and the
rest a patch. A breaking change described mid-sentence does not count — put the marker first.

AutoBump names the branch `chore/bump-x.x.x` and the commit `chore(bump): bumped version to x.x.x`.
Keep both: `delivery-release` matches on that string in the merge commit, and a squash or a rename
that loses it means no tag and no release.

### A package name that has never been published

CI cannot publish a new name until it has a trusted-publishing entry, and npm cannot create that
entry until the name exists — `npm trust` posts to `/-/package/<name>/trust`, which returns `E404`
for a package the registry has never seen. There is no pending-publisher concept. Break the cycle
once, by hand, with npm 11.5.1 or newer:

```bash
npm login   # 2FA, 2-hour session

# 1. create the name with a throwaway version, off the `latest` tag
cd plugins/code-health-backend
npm version --no-git-tag-version 0.0.1
npm publish --tag bootstrap --access public   # no --provenance; it only works inside CI
git checkout -- package.json

# 2. now the trust entry is accepted
npm trust github @rios0rios0/backstage-plugin-code-health-backend \
  --file default.yaml --repo rios0rios0/backstage-plugin-code-health --allow-publish

# 3. after CI has published the real version, retire the placeholder
npm dist-tag rm @rios0rios0/backstage-plugin-code-health-backend bootstrap
npm deprecate @rios0rios0/backstage-plugin-code-health-backend@0.0.1 \
  'placeholder that created the package for trusted publishing'
```

`--allow-publish` is not implied, and the workflow is named with `--file`, not `--workflow`. `npm
trust` has no update verb — only `github`, `list` and `revoke --id` — so a repository rename is
handled by adding an entry and revoking the old one.
