# @rios0rios0/backstage-plugin-code-health

The Backstage **frontend** plugin of the Code Health suite: a dashboard of CI status, releases,
tags, compliance checks and contributor metrics for the repositories in your Backstage catalog.

It requires `@rios0rios0/backstage-plugin-code-health-backend`, which is where the repositories are
discovered, the history is ingested and the credentials live. The browser holds no credential and
talks only to `/api/code-health`.

See the [repository README](https://github.com/rios0rios0/backstage-plugin-code-health#readme)
for installation, configuration and architecture.
