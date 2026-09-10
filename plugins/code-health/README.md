# @rios0rios0/backstage-plugin-code-health

The Backstage **frontend** plugin of the Code Health suite: a dashboard of CI status, releases,
tags, compliance checks and contributor metrics for the repositories in your Backstage catalog.

It requires `@rios0rios0/backstage-plugin-code-health-backend`, which is where the repositories are
discovered, the history is ingested and the credentials live. The browser holds no credential and
talks only to `/api/code-health`.

Beyond the tables, clicking a contributor or a repository opens that row's own page: the last one
to six months of the same figures the table prints, bucketed by day up to forty-five days and by
week beyond, bounded by what the backfill has actually collected. Each page heads itself with a
score — productivity for a person, health for a repository, both `0`–`100` — and never prints the
number on its own: the components it was folded from are rendered beside it, with anything nothing
could measure left out and its weight shared among the rest rather than counted as a zero. A
contributor's page also lists the repositories that person is responsible for, read from the
catalog's `spec.owner` and the groups they belong to. Administrators, and only administrators, get a
control in the header for re-collecting the history from scratch.

See the [repository README](https://github.com/rios0rios0/backstage-plugin-code-health#readme)
for installation, configuration and architecture.
