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
