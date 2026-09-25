# Claude Code usage

Claude Code token consumption is an optional, informational KPI. It appears in
the contributor table, a usage ranking, fleet Insights, and each person's detail
page with a trend and daily, weekly and monthly averages. It contributes no
component or weight to either productivity role or repository health.
The person detail page also shows the team's average consumption across people
with measured Claude usage, without assigning a performance grade to that comparison.

## Enable collection

```yaml
codeHealth:
  claude:
    enabled: true
    apiKey: "${ANTHROPIC_ADMIN_KEY}"
    historyDays: 90
    requestBudgetPerRun: 500
```

Both opt-in and a nonempty organization Admin API key are required. The key is
declared secret in the Backstage configuration schema and is used only by the
backend. The browser receives capability flags and aggregated measurements.
Disabling collection hides Claude cards and columns; stored history is preserved.

The source is Anthropic's
[Claude Code Analytics Admin API](https://platform.claude.com/docs/en/manage-claude/claude-code-analytics-api),
`GET /v1/organizations/usage_report/claude_code`. This integration supports that
API's organization reports. Individual subscriptions, Enterprise Analytics API
keys, Bedrock, Vertex AI and local session files are not interchangeable sources.
It does not read prompts, responses, source code or workstation credentials.

## What the numbers mean

| Measure | Provider field |
| --- | --- |
| Input tokens | `model_breakdown[].tokens.input` |
| Output tokens | `model_breakdown[].tokens.output` |
| Cache read tokens | `model_breakdown[].tokens.cache_read` |
| Cache creation tokens | `model_breakdown[].tokens.cache_creation` |
| Total tokens | Sum of all four categories, across models and terminal records |

Token consumption describes usage, not work quality. More tokens do not produce
a higher score. Claude tokens are kept separate from WakaTime AI tokens, which
can describe overlapping activity. No provider-reported Claude commits or lines
are added to version-control counters.

Reports are daily in UTC. The range picker selects the UTC dates touched by its
half-open range: September excludes October 1; a one-hour selection includes
the daily report for the date it touches. The card explicitly states this
granularity rather than presenting daily data as hourly measurements. Today's
report may be delayed or incomplete.

The daily average divides the collected total by all UTC dates touched by the
selection, including quiet dates. Weekly and monthly averages multiply that rate
by 7 and `365.25 / 12`. These are normalized averages; selecting a calendar month
shows its actual total. Gaps in collection can lower averages. A missing account
report remains unmeasured, while a report containing zero tokens remains zero.
An empty successful organization report is recorded as collected, without
inventing zero rows for people the API never named.

## Identity and scope

User actors are keyed by their normalized email under the `claude` identity
source. They use the same catalog-email reconciliation, manual linking, role
assignment, and person-wide exclusions as every other integration. Corrections
apply to all historical windows on the next read.

API actors have `api-key:<name>` keys and no email for automatic linking. A shared
key is not evidence of individual usage; an administrator can leave it separate,
exclude it, or explicitly link it when it represents one person. Renaming an API
key changes the identifier the API provides and may require a new manual link.

The API does not report repository attribution. Consequently there is no Claude
repository total. A repository-scoped contributor table only enriches people
already present through that repository's events, and their Claude figure stays
organization-wide, as the column tooltip explains.

## Scheduling, backfill and failures

Collection runs after the existing daily snapshot sweeps, including the initial
snapshot pass. It has its own request allowance and uses the shared provider
gateway for concurrency, retries, cancellation and rate limits. Every page and
retry spends from that allowance. A failed Claude request cannot consume another
integration's budget or remove a repository snapshot already captured.

The collector walks uncollected dates newest first, then refreshes collected
reports for today and yesterday. `historyDays` defaults to 90 and is bounded to
1–365. Increasing it backfills additional history; the ingestion reset remains
the existing version-control reset and does not delete Claude history.

Each day is paginated to completion before it is persisted. The database replaces
that day's rows and writes a collection marker in one transaction, including for
empty days. Repeated collection cannot double-count usage, and corrected reports
remove old rows. Invalid payloads, failed requests, repeated cursors, exhausted
budgets and cancellation leave unfinished days unmarked for retry. Older completed
dates are retained and are not continuously re-fetched.

Size the budget for at least one complete day plus ongoing recent-day refreshes.
An organization with more than 1,000 records on a day needs multiple pages. A
budget smaller than one complete day cannot advance that day; raise
`codeHealth.claude.requestBudgetPerRun` when the snapshot log reports starvation.
Backfill takes priority over refreshing already collected recent reports until
the missing dates are caught up. No live organization key is required for the
automated tests: they exercise the real HTTP transport against a controlled
provider server and the real database migrations against SQLite.
