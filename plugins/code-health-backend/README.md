# @rios0rios0/backstage-plugin-code-health-backend

The Backstage **backend** plugin of the Code Health suite.

It discovers repositories from the Backstage catalog, authenticates through the host application's
existing `integrations` configuration, ingests a year of their history in a rate-limited background
job, stores it in the Backstage database, and serves it to the frontend plugin under
`/api/code-health`.

Install it alongside `@rios0rios0/backstage-plugin-code-health`:

```ts
// packages/backend/src/index.ts
backend.add(import('@rios0rios0/backstage-plugin-code-health-backend'));
```

See the [repository README](https://github.com/rios0rios0/backstage-plugin-code-health#readme)
for configuration, the scheduled tasks and the operational notes.

## Optional integrations

Each one is absent unless it is configured, and the frontend asks which are on before it draws a
column. Every reference below covers exactly what is measured, how each number is derived, and what
the provider cannot answer:

- [WakaTime](docs/wakatime.md) — coding time, language and editor breakdowns, branches, and AI
  token counts
- [Jira](docs/jira.md) — tickets, interactions, story points, cycle and lead time
- [Confluence](docs/confluence.md) — pages, written volume, comments and page views

All three report people under account systems that agree with neither each other nor the catalog, so
a contributor row is a **person** rather than an account. The `Identities` screen is where an account
is attached to a catalog `User`; the WakaTime reference explains the rules that screen applies, and
they are the same for every source.
