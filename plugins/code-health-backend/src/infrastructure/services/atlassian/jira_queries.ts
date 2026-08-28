import type {
  JiraContributorMetrics,
  JiraIssueTypeBucket,
  JiraIssueTypeCounts,
  JiraOpenIssue,
  JiraPriorityCount,
  JiraRepositoryMetrics,
  JiraWindow,
} from "@rios0rios0/backstage-plugin-code-health-common";
import {
  buildDurationStats,
  classifyIssueType,
  computeBugRatio,
  EMPTY_JIRA_ISSUE_TYPES,
} from "@rios0rios0/backstage-plugin-code-health-common";

/**
 * JQL construction and response parsing for Jira Cloud, with no HTTP in sight.
 *
 * Everything Jira-specific that can be decided from a value rather than from a
 * connection lives here, because that is the layer where the mistakes are: a
 * date bound off by a timezone, a status matched on a name a site renamed, a
 * project key from a catalog annotation interpolated straight into a query.
 * The enricher beside it does nothing but issue the requests these functions
 * describe and hand the bodies back.
 */

// --- Wire shapes -----------------------------------------------------------

export interface JiraUserNode {
  readonly accountId?: string;
  readonly displayName?: string;
  readonly emailAddress?: string;
  readonly avatarUrls?: Readonly<Record<string, string>>;
}

export interface JiraFieldDescriptor {
  readonly id?: string;
  readonly name?: string;
  readonly custom?: boolean;
}

export interface JiraStatusDescriptor {
  readonly id?: string;
  readonly name?: string;
  readonly statusCategory?: { readonly key?: string } | null;
}

export interface JiraPriorityDescriptor {
  readonly id?: string;
  readonly name?: string;
}

/**
 * One item of a changelog entry.
 *
 * `fromString`/`toString` are deliberately not declared: they carry status
 * *names*, which every site is free to rename, and `from`/`to` carry the status
 * ids that {@link buildStatusCategories} resolves to a category Jira itself
 * defines. Reading the names would make the whole cycle-time calculation depend
 * on a team not having renamed "In Progress".
 */
export interface JiraChangeItem {
  readonly field?: string;
  readonly fieldId?: string;
  readonly from?: string | null;
  readonly to?: string | null;
}

export interface JiraChangeEntry {
  readonly author?: JiraUserNode | null;
  readonly created?: string;
  readonly items?: readonly JiraChangeItem[];
}

export interface JiraActivityNode {
  readonly author?: JiraUserNode | null;
  readonly created?: string;
  /** Worklog only: when the work happened, as opposed to when it was booked. */
  readonly started?: string;
}

export type JiraIssueFields = {
  readonly [field: string]: unknown;
  readonly summary?: string | null;
  readonly created?: string | null;
  readonly resolutiondate?: string | null;
  readonly issuetype?: { readonly name?: string; readonly subtask?: boolean } | null;
  readonly status?: { readonly id?: string } | null;
  readonly priority?: { readonly name?: string } | null;
  readonly reporter?: JiraUserNode | null;
  readonly creator?: JiraUserNode | null;
  readonly assignee?: JiraUserNode | null;
  readonly comment?: {
    readonly comments?: readonly JiraActivityNode[];
    readonly total?: number;
    readonly maxResults?: number;
  } | null;
  readonly worklog?: {
    readonly worklogs?: readonly JiraActivityNode[];
    readonly total?: number;
    readonly maxResults?: number;
  } | null;
};

export interface JiraIssueNode {
  readonly key?: string;
  readonly fields?: JiraIssueFields;
  readonly changelog?: {
    readonly histories?: readonly JiraChangeEntry[];
    readonly total?: number;
    readonly maxResults?: number;
  } | null;
}

export interface JiraSearchResponse {
  readonly issues?: readonly JiraIssueNode[];
  /**
   * Cursor for the next page.
   *
   * The enhanced search paginates by opaque token and reports no `total` at
   * all, which is why every count in this file comes either from walking the
   * pages or from the separate approximate-count endpoint.
   */
  readonly nextPageToken?: string;
  readonly isLast?: boolean;
}

export interface JiraApproximateCountResponse {
  readonly count?: number;
}

// --- Scope -----------------------------------------------------------------

/**
 * The slice of Jira one or more repositories map onto.
 *
 * Several repositories routinely share a project, so this is what queries are
 * grouped by. Asking once per repository would download one identical answer
 * once per repository — the same mistake Azure DevOps branch policies used to
 * make here, at forty times the cost.
 */
export interface JiraScope {
  readonly projectKey: string;
  readonly component: string | null;
}

export const scopeKey = (scope: JiraScope): string =>
  `${scope.projectKey.toUpperCase()}::${scope.component?.toLowerCase() ?? ""}`;

// --- JQL -------------------------------------------------------------------

/**
 * Quotes a value for JQL.
 *
 * Project keys and component names arrive from a catalog annotation, which is a
 * YAML file anybody with write access to a repository can edit. An unescaped
 * quote there would close the string literal and let the rest of the annotation
 * become query syntax. The worst outcome is a wrong measurement rather than a
 * data breach, which is not a reason to leave it open.
 */
export const quoteJql = (value: string): string =>
  `"${value.replace(/\\/gu, "\\\\").replace(/"/gu, '\\"')}"`;

/** `yyyy-MM-dd`, the only date form JQL accepts without a timezone argument. */
export const jqlDate = (instant: Date): string => instant.toISOString().slice(0, 10);

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Widens a window by a day at each end before it becomes a JQL bound.
 *
 * JQL resolves a bare date in the *token owner's* Jira profile timezone, not in
 * UTC and not in the caller's. There is no way to say otherwise in the query,
 * so a bound stated to the day is up to a day out in either direction depending
 * on whose token is configured. Asking for a day too much on each side and then
 * filtering on the ISO instants the issues themselves carry — which are
 * unambiguous — makes the result independent of that setting.
 *
 * The extra day costs a handful of issues per query and buys a number that does
 * not change when somebody moves the service account to another office.
 */
export const widenWindow = (window: { from: Date; to: Date }): { from: Date; to: Date } => ({
  from: new Date(window.from.getTime() - DAY_MS),
  to: new Date(window.to.getTime() + DAY_MS),
});

const conjunction = (clauses: readonly (string | null)[]): string =>
  clauses.filter((clause): clause is string => clause !== null).join(" AND ");

const scopeClauses = (scope: JiraScope, filter: string | null): (string | null)[] => [
  `project = ${quoteJql(scope.projectKey)}`,
  scope.component === null ? null : `component = ${quoteJql(scope.component)}`,
  // Parenthesised because an operator's filter is free to contain `OR`, and an
  // unbracketed one would silently widen every query it was appended to.
  filter === null || filter.trim() === "" ? null : `(${filter.trim()})`,
];

/**
 * Every issue in the scope that was touched inside the window.
 *
 * Filtered on `updated` rather than on `created` or `resolved` because one
 * query has to answer all of "created here", "resolved here" and "commented on
 * here", and `updated` is the only field Jira moves for all three. Ordered
 * newest-first so a project large enough to hit the per-run ceiling is truncated
 * at its oldest end rather than at its most relevant one.
 */
export const buildActivityJql = (
  scope: JiraScope,
  window: { from: Date; to: Date },
  filter: string | null,
): string => {
  const widened = widenWindow(window);
  return `${conjunction([
    ...scopeClauses(scope, filter),
    `updated >= ${jqlDate(widened.from)}`,
    `updated <= ${jqlDate(widened.to)}`,
  ])} ORDER BY updated DESC`;
};

/**
 * Issues that are not in a done status right now.
 *
 * `statusCategory` rather than `status`: the three categories are Jira's own
 * and cannot be renamed, while the statuses inside them are named by whoever
 * built the workflow. A query naming statuses works on the site it was written
 * for and quietly returns nothing on the next one.
 */
export const buildOpenIssuesJql = (scope: JiraScope, filter: string | null): string =>
  conjunction([...scopeClauses(scope, filter), "statusCategory != Done"]);

export const buildOpenByPriorityJql = (
  scope: JiraScope,
  priority: string,
  filter: string | null,
): string =>
  conjunction([
    ...scopeClauses(scope, filter),
    "statusCategory != Done",
    `priority = ${quoteJql(priority)}`,
  ]);

/** The single oldest unfinished issue, which is the one worth naming. */
export const buildOldestOpenJql = (scope: JiraScope, filter: string | null): string =>
  `${buildOpenIssuesJql(scope, filter)} ORDER BY created ASC`;

// --- Site metadata ---------------------------------------------------------

/**
 * The names Jira gives the story-point field, most specific first.
 *
 * Company-managed projects call it `Story Points`; team-managed ones call it
 * `Story point estimate`, and a site running both carries both fields with
 * different ids. There is no way to tell from a field list which of the two a
 * given project uses, so the first is preferred and the documentation tells an
 * operator running both to pin the id.
 */
export const STORY_POINT_FIELD_NAMES: readonly string[] = [
  "story points",
  "story point estimate",
];

/**
 * The custom field id story points live on, or null when the site has none.
 *
 * Null is the honest answer and it propagates all the way to an em dash on the
 * dashboard. Jira has no standard field for this — it is a custom field whose
 * id differs per site — so guessing one would produce a column of zeroes that
 * reads as a team estimating nothing.
 */
export const resolveStoryPointsField = (
  fields: readonly JiraFieldDescriptor[],
  pinned: string | null,
): string | null => {
  if (pinned !== null && pinned.trim() !== "") return pinned.trim();

  const byName = new Map<string, string>();
  for (const field of fields) {
    if (field.id === undefined || field.name === undefined) continue;
    const name = field.name.trim().toLowerCase();
    if (!byName.has(name)) byName.set(name, field.id);
  }

  for (const candidate of STORY_POINT_FIELD_NAMES) {
    const id = byName.get(candidate);
    if (id !== undefined) return id;
  }
  return null;
};

/** The three categories Jira defines and no site can rename. */
export type JiraStatusCategory = "new" | "indeterminate" | "done";

const CATEGORY_KEYS: ReadonlyMap<string, JiraStatusCategory> = new Map([
  ["new", "new"],
  ["indeterminate", "indeterminate"],
  ["done", "done"],
]);

/**
 * Status id to category.
 *
 * The changelog reports transitions as status ids and names but never as
 * categories, so this map is what turns "moved to 47" into "started work".
 * Without it there is no honest way to read a cycle time: matching the name
 * against "In Progress" works until a team renames the column.
 */
export const buildStatusCategories = (
  statuses: readonly JiraStatusDescriptor[],
): Map<string, JiraStatusCategory> => {
  const categories = new Map<string, JiraStatusCategory>();
  for (const status of statuses) {
    const category = CATEGORY_KEYS.get(status.statusCategory?.key ?? "");
    if (status.id !== undefined && category !== undefined) {
      categories.set(status.id, category);
    }
  }
  return categories;
};

// --- Parsing ---------------------------------------------------------------

export interface JiraAccount {
  /** Lowercased, and the key every tally and every link is grouped under. */
  readonly accountId: string;
  /**
   * Exactly as Jira returned it, which is what a profile URL has to be built
   * from. Atlassian's own ids are lowercase in practice, but they are opaque
   * strings the API round-trips verbatim — folding case for a *key* is safe,
   * folding it for a *link* is a guess about somebody else's identifier.
   */
  readonly rawAccountId: string;
  readonly displayName: string | null;
  readonly email: string | null;
  readonly avatarUrl: string | null;
}

export interface JiraActivityFact {
  readonly accountId: string;
  readonly at: Date;
}

export interface JiraTransitionFact extends JiraActivityFact {
  readonly fromCategory: JiraStatusCategory | null;
  readonly toCategory: JiraStatusCategory | null;
}

export interface JiraIssueFacts {
  readonly key: string;
  readonly summary: string | null;
  readonly typeBucket: JiraIssueTypeBucket;
  readonly priority: string | null;
  readonly createdAt: Date | null;
  readonly resolvedAt: Date | null;
  /** First move into an in-progress status, whenever it happened. */
  readonly startedAt: Date | null;
  readonly reporter: JiraAccount | null;
  readonly assignee: JiraAccount | null;
  readonly storyPoints: number | null;
  /** Null when the search did not return comment bodies for this issue at all. */
  readonly comments: readonly JiraActivityFact[] | null;
  readonly worklog: readonly JiraActivityFact[] | null;
  readonly transitions: readonly JiraTransitionFact[];
  /** Every account seen anywhere on the issue, for identity observation. */
  readonly accounts: readonly JiraAccount[];
  /** One of the three lists came back capped, so its counts are floors. */
  readonly truncated: boolean;
}

const instantOf = (value: unknown): Date | null => {
  if (typeof value !== "string" || value === "") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * Atlassian's `accountId`, lowercased.
 *
 * The `accountId` is the only identifier GDPR-era Jira returns on every
 * endpoint — `emailAddress` is present only when the person made their address
 * visible, and `name`/`key` were removed outright — so it is the source key,
 * and the e-mail is recorded when offered purely so the identity screen has
 * something to match a catalog user on.
 */
const accountOf = (node: JiraUserNode | null | undefined): JiraAccount | null => {
  const rawAccountId = node?.accountId?.trim();
  if (!rawAccountId) return null;
  return {
    accountId: rawAccountId.toLowerCase(),
    rawAccountId,
    displayName: node?.displayName ?? null,
    email: node?.emailAddress ?? null,
    avatarUrl: node?.avatarUrls?.["48x48"] ?? null,
  };
};

const activitiesOf = (
  nodes: readonly JiraActivityNode[],
  pickInstant: (node: JiraActivityNode) => unknown,
): { activities: JiraActivityFact[]; accounts: JiraAccount[] } => {
  const activities: JiraActivityFact[] = [];
  const accounts: JiraAccount[] = [];

  for (const node of nodes) {
    const account = accountOf(node.author);
    const at = instantOf(pickInstant(node));
    if (account === null || at === null) continue;
    activities.push({ accountId: account.accountId, at });
    accounts.push(account);
  }

  return { activities, accounts };
};

const isTruncated = (
  container: { readonly total?: number; readonly maxResults?: number } | null | undefined,
  received: number,
): boolean => (container?.total ?? received) > received;

/**
 * A numeric custom field, which Jira returns as a number, a numeric string, or
 * `null` depending on the field type and the site.
 */
const numberOf = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export interface ParseIssueOptions {
  readonly storyPointsField: string | null;
  readonly categories: ReadonlyMap<string, JiraStatusCategory>;
}

/**
 * Normalises one search hit.
 *
 * Returns null for an issue with no key, which is the only field everything
 * downstream needs; everything else degrades to null on its own rather than
 * discarding the issue, because an issue with an unparseable resolution date is
 * still an issue somebody created.
 */
export const parseIssue = (
  node: JiraIssueNode,
  options: ParseIssueOptions,
): JiraIssueFacts | null => {
  const key = node.key;
  if (key === undefined || key === "") return null;

  const fields = node.fields ?? {};
  const accounts: JiraAccount[] = [];

  const reporter = accountOf(fields.reporter ?? fields.creator);
  if (reporter !== null) accounts.push(reporter);
  const assignee = accountOf(fields.assignee);
  if (assignee !== null) accounts.push(assignee);

  const commentContainer = fields.comment ?? null;
  const commentNodes = commentContainer?.comments;
  const comments =
    commentNodes === undefined
      ? null
      : activitiesOf(commentNodes, (activity) => activity.created);
  if (comments !== null) accounts.push(...comments.accounts);

  const worklogContainer = fields.worklog ?? null;
  const worklogNodes = worklogContainer?.worklogs;
  // Booked against `started`, not `created`: a Friday afternoon logged on the
  // following Monday is Friday's work, and counting it on the Monday would move
  // effort between two windows the dashboard shows side by side.
  const worklog =
    worklogNodes === undefined
      ? null
      : activitiesOf(worklogNodes, (activity) => activity.started ?? activity.created);
  if (worklog !== null) accounts.push(...worklog.accounts);

  const transitions: JiraTransitionFact[] = [];
  let startedAt: Date | null = null;
  let lastDone: Date | null = null;

  for (const entry of node.changelog?.histories ?? []) {
    const author = accountOf(entry.author);
    const at = instantOf(entry.created);
    if (at === null) continue;
    if (author !== null) accounts.push(author);

    for (const item of entry.items ?? []) {
      if ((item.fieldId ?? item.field) !== "status") continue;

      const fromCategory = options.categories.get(item.from ?? "") ?? null;
      const toCategory = options.categories.get(item.to ?? "") ?? null;

      if (toCategory === "indeterminate" && (startedAt === null || at < startedAt)) {
        startedAt = at;
      }
      if (toCategory === "done" && (lastDone === null || at > lastDone)) lastDone = at;

      if (author !== null) {
        transitions.push({ accountId: author.accountId, at, fromCategory, toCategory });
      }
    }
  }

  return {
    key,
    summary: fields.summary ?? null,
    typeBucket: classifyIssueType(
      fields.issuetype?.name ?? null,
      fields.issuetype?.subtask ?? false,
    ),
    priority: fields.priority?.name ?? null,
    createdAt: instantOf(fields.created),
    // The changelog is the fallback rather than the source: `resolutiondate` is
    // what Jira's own reports use, and an issue moved to a done status without
    // a resolution set is a workflow this plugin should report the same way the
    // site does.
    resolvedAt: instantOf(fields.resolutiondate) ?? lastDone,
    startedAt,
    reporter,
    assignee,
    storyPoints:
      options.storyPointsField === null
        ? null
        : numberOf(fields[options.storyPointsField]),
    comments: comments?.activities ?? null,
    worklog: worklog?.activities ?? null,
    transitions,
    accounts,
    truncated:
      isTruncated(commentContainer, comments?.activities.length ?? 0) ||
      isTruncated(worklogContainer, worklog?.activities.length ?? 0) ||
      isTruncated(node.changelog, node.changelog?.histories?.length ?? 0),
  };
};

// --- Tallying --------------------------------------------------------------

const HOUR_MS = 60 * 60 * 1000;

const hoursBetween = (from: Date, to: Date): number =>
  Math.round(((to.getTime() - from.getTime()) / HOUR_MS) * 10) / 10;

const within = (instant: Date, window: { from: Date; to: Date }): boolean =>
  instant >= window.from && instant <= window.to;

interface Tally {
  issuesCreated: number;
  issuesResolved: number;
  comments: number;
  worklogEntries: number;
  transitions: number;
  truncatedIssues: number;
  storyPointsEstimated: number;
  storyPointsCompleted: number;
  cycleHours: number[];
  leadHours: number[];
  resolvedByType: JiraIssueTypeCounts;
  reopened: number;
}

const emptyTally = (): Tally => ({
  issuesCreated: 0,
  issuesResolved: 0,
  comments: 0,
  worklogEntries: 0,
  transitions: 0,
  truncatedIssues: 0,
  storyPointsEstimated: 0,
  storyPointsCompleted: 0,
  cycleHours: [],
  leadHours: [],
  resolvedByType: EMPTY_JIRA_ISSUE_TYPES,
  reopened: 0,
});

const bump = (counts: JiraIssueTypeCounts, bucket: JiraIssueTypeBucket): JiraIssueTypeCounts => ({
  ...counts,
  [bucket]: counts[bucket] + 1,
});

const sumOf = (values: readonly number[]): number =>
  Math.round(values.reduce((total, value) => total + value, 0) * 10) / 10;

const toWindow = (window: { from: Date; to: Date }): JiraWindow => ({
  from: window.from.toISOString(),
  to: window.to.toISOString(),
});

/**
 * Cycle and lead time for one resolved issue.
 *
 * Cycle time needs a start, and an issue that went straight from the backlog to
 * done never had one — it is excluded rather than counted as instantaneous,
 * which would drag every median towards zero and make a team look faster the
 * more work it skipped the board with. A start recorded *after* the resolution
 * is a changelog the search truncated, and is dropped for the same reason.
 */
const durationsOf = (
  issue: JiraIssueFacts,
  resolvedAt: Date,
): { cycle: number | null; lead: number | null } => ({
  cycle:
    issue.startedAt !== null && issue.startedAt <= resolvedAt
      ? hoursBetween(issue.startedAt, resolvedAt)
      : null,
  lead:
    issue.createdAt !== null && issue.createdAt <= resolvedAt
      ? hoursBetween(issue.createdAt, resolvedAt)
      : null,
});

interface TallyContext {
  readonly window: { from: Date; to: Date };
  readonly storyPointsResolved: boolean;
}

/**
 * Walks the issues once, handing every fact that lands inside the window to a
 * sink.
 *
 * The contributor and repository passes disagree only about *whose* tally a
 * fact belongs to, so the traversal — which is where the attribution rules
 * live — is written once and the two callers supply a key.
 */
const walk = (
  issues: readonly JiraIssueFacts[],
  context: TallyContext,
  tallyFor: (accountId: string | null) => Tally | null,
): void => {
  // One guard rather than one per fact: an issue with no reporter, no assignee
  // or no author on a change is normal in Jira, and every one of those has to
  // be dropped rather than attributed to a placeholder person.
  const charge = (accountId: string | null, apply: (tally: Tally) => void): void => {
    const tally = tallyFor(accountId);
    if (tally !== null) apply(tally);
  };

  for (const issue of issues) {
    const createdInWindow = issue.createdAt !== null && within(issue.createdAt, context.window);
    const resolvedInWindow =
      issue.resolvedAt !== null && within(issue.resolvedAt, context.window);

    if (createdInWindow) {
      charge(issue.reporter?.accountId ?? null, (tally) => {
        tally.issuesCreated += 1;
        if (context.storyPointsResolved) {
          tally.storyPointsEstimated += issue.storyPoints ?? 0;
        }
      });
    }

    if (resolvedInWindow && issue.resolvedAt !== null) {
      const durations = durationsOf(issue, issue.resolvedAt);
      charge(issue.assignee?.accountId ?? null, (tally) => {
        tally.issuesResolved += 1;
        tally.resolvedByType = bump(tally.resolvedByType, issue.typeBucket);
        if (context.storyPointsResolved) {
          tally.storyPointsCompleted += issue.storyPoints ?? 0;
        }
        if (durations.cycle !== null) tally.cycleHours.push(durations.cycle);
        if (durations.lead !== null) tally.leadHours.push(durations.lead);
      });
    }

    for (const comment of issue.comments ?? []) {
      if (!within(comment.at, context.window)) continue;
      charge(comment.accountId, (tally) => (tally.comments += 1));
    }

    for (const entry of issue.worklog ?? []) {
      if (!within(entry.at, context.window)) continue;
      charge(entry.accountId, (tally) => (tally.worklogEntries += 1));
    }

    for (const transition of issue.transitions) {
      if (!within(transition.at, context.window)) continue;
      charge(transition.accountId, (tally) => (tally.transitions += 1));

      // Charged to the assignee rather than to whoever pressed the button. A
      // reopened ticket is a statement about work coming back, and the person
      // who noticed the defect is not the person it came back to.
      if (transition.fromCategory === "done" && transition.toCategory !== "done") {
        charge(issue.assignee?.accountId ?? null, (tally) => (tally.reopened += 1));
      }
    }

    if (issue.truncated) {
      // Charged to everyone who appears on the issue, because they are exactly
      // the people whose counts might be understated by the cap.
      for (const account of new Set(issue.accounts.map((entry) => entry.accountId))) {
        charge(account, (tally) => (tally.truncatedIssues += 1));
      }
    }
  }
};

const nullableTotal = (available: boolean, value: number): number | null =>
  available ? value : null;

/**
 * Per-person measures for one window.
 *
 * Comment and worklog counts collapse to null for *everybody* when no issue in
 * the batch carried the corresponding container, because that is a statement
 * about the site rather than about a person: Jira Cloud's enhanced search
 * returns those fields only on request and some deployments drop them, and a
 * zero would read as a team that never discusses its work.
 */
export const tallyContributors = (
  issues: readonly JiraIssueFacts[],
  window: { from: Date; to: Date },
  options: { storyPointsResolved: boolean },
): Map<string, JiraContributorMetrics> => {
  const tallies = new Map<string, Tally>();
  const commentsAvailable = issues.some((issue) => issue.comments !== null);
  const worklogAvailable = issues.some((issue) => issue.worklog !== null);

  walk(issues, { window, storyPointsResolved: options.storyPointsResolved }, (accountId) => {
    if (accountId === null) return null;
    const existing = tallies.get(accountId);
    if (existing !== undefined) return existing;
    const created = emptyTally();
    tallies.set(accountId, created);
    return created;
  });

  const wire = toWindow(window);

  return new Map(
    [...tallies.entries()].map(([accountId, tally]) => [
      accountId,
      {
        window: wire,
        issuesCreated: tally.issuesCreated,
        issuesResolved: tally.issuesResolved,
        interactions: {
          comments: nullableTotal(commentsAvailable, tally.comments),
          worklogEntries: nullableTotal(worklogAvailable, tally.worklogEntries),
          transitions: tally.transitions,
          truncatedIssues: tally.truncatedIssues,
        },
        storyPointsEstimated: nullableTotal(
          options.storyPointsResolved,
          tally.storyPointsEstimated,
        ),
        storyPointsCompleted: nullableTotal(
          options.storyPointsResolved,
          tally.storyPointsCompleted,
        ),
        cycleTime:
          tally.cycleHours.length === 0
            ? null
            : { totalHours: sumOf(tally.cycleHours), issues: tally.cycleHours.length },
        leadTime:
          tally.leadHours.length === 0
            ? null
            : { totalHours: sumOf(tally.leadHours), issues: tally.leadHours.length },
        resolvedByType: tally.resolvedByType,
        reopened: tally.reopened,
      } satisfies JiraContributorMetrics,
    ]),
  );
};

export interface RepositoryExtras {
  readonly openIssues: number | null;
  readonly oldestOpenIssue: JiraOpenIssue | null;
  readonly openByPriority: readonly JiraPriorityCount[];
  readonly storyPointsResolved: boolean;
}

const WEEK_MS = 7 * DAY_MS;

/**
 * Issues resolved per week, or null for a window shorter than a day.
 *
 * A rate extrapolated from an hour of evidence is arithmetic rather than
 * measurement, and a dashboard that reports "112 issues per week" because two
 * closed inside a lunch break is worse than one that reports nothing.
 */
export const throughputPerWeek = (
  resolved: number,
  window: { from: Date; to: Date },
): number | null => {
  const span = window.to.getTime() - window.from.getTime();
  if (span < DAY_MS) return null;
  return Math.round((resolved / (span / WEEK_MS)) * 10) / 10;
};

/** Per-project measures for one window. */
export const tallyRepository = (
  issues: readonly JiraIssueFacts[],
  scope: JiraScope,
  window: { from: Date; to: Date },
  extras: RepositoryExtras,
): JiraRepositoryMetrics => {
  const tally = emptyTally();
  const contributors = new Set<string>();

  walk(
    issues,
    { window, storyPointsResolved: extras.storyPointsResolved },
    (accountId) => {
      if (accountId !== null) contributors.add(accountId);
      return tally;
    },
  );

  return {
    window: toWindow(window),
    projectKey: scope.projectKey,
    component: scope.component,
    issuesCreated: tally.issuesCreated,
    issuesResolved: tally.issuesResolved,
    throughputPerWeek: throughputPerWeek(tally.issuesResolved, window),
    resolvedByType: tally.resolvedByType,
    bugRatio: computeBugRatio(tally.resolvedByType),
    reopened: tally.reopened,
    cycleTime: buildDurationStats(tally.cycleHours),
    leadTime: buildDurationStats(tally.leadHours),
    storyPointsEstimated: nullableTotal(
      extras.storyPointsResolved,
      tally.storyPointsEstimated,
    ),
    storyPointsCompleted: nullableTotal(
      extras.storyPointsResolved,
      tally.storyPointsCompleted,
    ),
    openIssues: extras.openIssues,
    oldestOpenIssue: extras.oldestOpenIssue,
    openByPriority: extras.openByPriority,
    contributors: contributors.size,
  };
};

/**
 * The oldest unfinished issue, aged against the end of the window rather than
 * against the wall clock.
 *
 * Every other figure on the row is scoped to the window, and an age measured
 * from "now" would be the one number that silently moved when the page was left
 * open.
 */
export const toOpenIssue = (
  issue: JiraIssueFacts | null,
  measuredAt: Date,
): JiraOpenIssue | null => {
  if (issue === null || issue.createdAt === null) return null;
  return {
    key: issue.key,
    summary: issue.summary,
    createdAt: issue.createdAt.toISOString(),
    ageDays: Math.max(
      0,
      Math.floor((measuredAt.getTime() - issue.createdAt.getTime()) / DAY_MS),
    ),
  };
};
