# Contributing

Contributions are welcome. By participating, you agree to maintain a respectful and constructive environment.

For coding standards, testing patterns, architecture guidelines, commit conventions, and all
development practices, refer to the **[Development Guide](https://github.com/rios0rios0/guide/wiki)**.

## Prerequisites

- Node.js 20+
- [Corepack](https://nodejs.org/api/corepack.html) (ships with Node.js 16.13+)
- [Make](https://www.gnu.org/software/make/)
- A [Backstage](https://backstage.io) app to try the plugin in (optional, but recommended)

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

The toolchain is the Backstage CLI (`backstage-cli package build | lint | test`). This package is a
library, so there is no app dev server. To exercise a change in a real app, build it and link it into
a Backstage app:

```bash
yarn build
yarn link
yarn --cwd /path/to/your-backstage-instance/packages/app link @rios0rios0/backstage-plugin-code-health
```

Then mount `CodeHealthPage` as described in the [README](README.md#installation).

## Adding a New Platform

The plugin reaches GitHub and Azure DevOps through the Adapter pattern. To add another forge:

1. Add the identifier to `Platform` in `src/domain/entities/platform.ts`
2. Implement `RepositoryRepository`, `ContributorRepository`, `ComplianceRepository` and
   `BadgeRepository` under `src/infrastructure/repositories/`, taking an HTTP client in the constructor
3. Register the implementations in the handler maps in `src/main/factories/repository_factory.ts`
4. Add the target to `IntegrationTarget`, `DEFAULT_BASE_URLS` and the config schema in `config.d.ts`
5. Add tests following the [testing guide](https://github.com/rios0rios0/guide/wiki/Tests)
6. Update `CHANGELOG.md` with an entry under `[Unreleased] > Added`
