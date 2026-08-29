import type {
  ChurnUnit,
  ConfluenceContributorMetrics,
  ContributorIdentity,
  ContributorSummary,
  JiraContributorMetrics,
  QualityGateStatus,
  SonarMetrics,
  WakaTimeMetrics,
} from "@rios0rios0/backstage-plugin-code-health-common";
import {
  computeRate,
  formatDebt,
  mergeConfluenceContributorMetrics,
  mergeJiraContributorMetrics,
  mergeWakaTimeMetrics,
} from "@rios0rios0/backstage-plugin-code-health-common";
import type { CodeHealthEvent } from "../entities/code_health_event";
import { toDay } from "../entities/day";
import { identityKey, normalizeSourceKey, type IdentityRef } from "../entities/identity";
import { PersonDirectory } from "../entities/person_directory";
import type { CodeHealthStore } from "../repositories/code_health_store";
import type { CatalogReader } from "../services/catalog_reader";
import type { DirectoryReader } from "../services/identity_resolver";

interface Accumulator {
  displayName: string | null;
  avatarUrl: string | null;
  profileUrl: string | null;
  /** The accounts merged onto this row, keyed so a repeat does not duplicate. */
  identities: Map<string, ContributorIdentity>;
  commits: number;
  linesAdded: number;
  linesDeleted: number;
  changedFiles: number;
  /**
   * Whether the provider *reported* the field at all, which is not the same
   * question as whether the number came back above zero. A quiet week is a real
   * measurement of zero; a provider that has no line counts is not.
   */
  sawLines: boolean;
  sawFiles: boolean;
  pullRequestsOpened: number;
  pullRequestsMerged: number;
  reviewsGiven: number;
  reviewsApproved: number;
  reviewsRejected: number;
  pipelineRuns: number;
  pipelineRunsSucceeded: number;
  repositories: Set<string>;
  wakaTime: WakaTimeMetrics[];
  jira: JiraContributorMetrics[];
  confluence: ConfluenceContributorMetrics[];
}

/**
 * Which unit this contributor's churn was measured in.
 *
 * Lines win when both are present, because a fleet spanning both providers
 * should show the more precise figure where it exists rather than degrading
 * everything to the coarser one.
 */
const churnUnitOf = (accumulator: Accumulator): ChurnUnit => {
  if (accumulator.sawLines) return "lines";
  return accumulator.sawFiles ? "files" : "none";
};

const empty = (): Accumulator => ({
  displayName: null,
  avatarUrl: null,
  profileUrl: null,
  identities: new Map(),
  commits: 0,
  linesAdded: 0,
  linesDeleted: 0,
  changedFiles: 0,
  sawLines: false,
  sawFiles: false,
  pullRequestsOpened: 0,
  pullRequestsMerged: 0,
  reviewsGiven: 0,
  reviewsApproved: 0,
  reviewsRejected: 0,
  pipelineRuns: 0,
  pipelineRunsSucceeded: 0,
  repositories: new Set(),
  wakaTime: [],
  jira: [],
  confluence: [],
});

const remember = (
  accumulator: Accumulator,
  identity: IdentityRef,
  displayName: string | null,
): void => {
  accumulator.identities.set(identityKey(identity), {
    source: identity.source,
    sourceKey: identity.sourceKey,
    displayName,
  });
};

const applyEvent = (accumulator: Accumulator, event: CodeHealthEvent): void => {
  accumulator.repositories.add(event.repositoryId);
  if (event.actorName) accumulator.displayName = event.actorName;
  if (event.actorAvatarUrl) accumulator.avatarUrl = event.actorAvatarUrl;

  switch (event.kind) {
    case "commit":
      accumulator.commits += 1;
      accumulator.linesAdded += event.additions ?? 0;
      accumulator.linesDeleted += event.deletions ?? 0;
      accumulator.changedFiles += event.changedFiles ?? 0;
      if (event.additions !== null || event.deletions !== null) {
        accumulator.sawLines = true;
      }
      if (event.changedFiles !== null) accumulator.sawFiles = true;
      break;
    case "pull_request":
      if (event.outcome === "open") accumulator.pullRequestsOpened += 1;
      if (event.outcome === "merged") accumulator.pullRequestsMerged += 1;
      break;
    case "pr_review":
      accumulator.reviewsGiven += 1;
      if (
        event.outcome === "approved" ||
        event.outcome === "approved_with_suggestions"
      ) {
        accumulator.reviewsApproved += 1;
      }
      if (event.outcome === "rejected") accumulator.reviewsRejected += 1;
      break;
    case "build":
      accumulator.pipelineRuns += 1;
      if (event.outcome === "succeeded") accumulator.pipelineRunsSucceeded += 1;
      break;
    default:
      break;
  }
};

/**
 * Sonar health of the repositories a contributor touched in the window.
 *
 * This is deliberately *not* an attribution: SonarQube measures projects, not
 * people, and nothing here claims the bugs are theirs. It answers "what does the
 * code this person worked on look like", which is the only honest reading of a
 * per-project measure on a per-person row — and it is why two people on the same
 * repository see the same figures.
 *
 * Counts are summed because a person spanning three repositories carries all
 * three. Percentages are averaged rather than summed, since adding coverage
 * figures is meaningless. The quality gate takes the worst value present, so one
 * failing repository is visible rather than being averaged away.
 */
const aggregateSonar = (
  repositoryIds: ReadonlySet<string>,
  byRepository: ReadonlyMap<string, SonarMetrics>,
): SonarMetrics | null => {
  const present = [...repositoryIds]
    .map((id) => byRepository.get(id))
    .filter((metrics): metrics is SonarMetrics => metrics !== undefined);
  if (present.length === 0) return null;

  const sum = (pick: (metrics: SonarMetrics) => number) =>
    present.reduce((total, metrics) => total + pick(metrics), 0);
  const mean = (pick: (metrics: SonarMetrics) => number) =>
    Math.round((sum(pick) / present.length) * 10) / 10;

  // Ordered rather than nested ternaries: `ERROR` must win over `OK`, and `OK`
  // over `NONE`, so one failing repository stays visible on the row.
  const severity: Record<QualityGateStatus, number> = {
    NONE: 0,
    OK: 1,
    ERROR: 2,
  };
  const worst = present.reduce<QualityGateStatus>(
    (highest, metrics) =>
      severity[metrics.qualityGateStatus] > severity[highest]
        ? metrics.qualityGateStatus
        : highest,
    "NONE",
  );

  const debtMinutes = sum((metrics) => metrics.technicalDebtMinutes);

  return {
    bugs: sum((metrics) => metrics.bugs),
    codeSmells: sum((metrics) => metrics.codeSmells),
    securityHotspots: sum((metrics) => metrics.securityHotspots),
    vulnerabilities: sum((metrics) => metrics.vulnerabilities),
    coverage: mean((metrics) => metrics.coverage),
    duplications: mean((metrics) => metrics.duplications),
    technicalDebt: formatDebt(debtMinutes),
    technicalDebtMinutes: debtMinutes,
    qualityGateStatus: worst,
  };
};

/**
 * What to call somebody nothing has a name for.
 *
 * The account key, not the person key: `wakatime:jrios` on a row tells a reader
 * which system to go and look in, whereas a bare entity reference for an
 * unlinked person would be a key nobody typed and nobody recognises.
 */
const fallbackName = (personKey: string, totals: Accumulator): string => {
  const first = [...totals.identities.values()][0];
  return first === undefined ? personKey : identityKey(first);
};

/**
 * Folds one person's Confluence accounts together.
 *
 * Null for an empty list rather than a zeroed row, for the same reason as
 * everywhere else here: somebody who does not write in Confluence must not
 * appear as somebody who wrote nothing.
 */
const mergeConfluence = (
  parts: readonly ConfluenceContributorMetrics[],
): ConfluenceContributorMetrics | null =>
  parts.reduce<ConfluenceContributorMetrics | null>(
    (merged, next) =>
      merged === null ? next : mergeConfluenceContributorMetrics(merged, next),
    null,
  );


const mergeIdentities = (
  seen: ReadonlyMap<string, ContributorIdentity>,
  known: readonly ContributorIdentity[],
): ContributorIdentity[] => {
  const merged = new Map(seen);
  for (const identity of known) {
    const key = identityKey(identity);
    const existing = merged.get(key);
    // The identity table's name is the one the source itself reports, so it
    // wins over the name a provider stamped on a commit — which is whatever the
    // committer had in their git config that day.
    if (existing === undefined || existing.displayName === null) merged.set(key, identity);
  }
  return [...merged.values()];
};

export interface ListContributorSummariesOptions {
  readonly store: CodeHealthStore;
  readonly catalog?: CatalogReader;
  readonly directory?: DirectoryReader;
}

export class ListContributorSummaries {
  constructor(private readonly options: ListContributorSummariesOptions) {}

  /**
   * Groups a window's activity by *person*.
   *
   * A row used to be an account: the commit author e-mail on Azure DevOps, the
   * login on GitHub, and one human under two addresses on two rows. That was
   * survivable while commits were the only thing measured. Once coding time
   * arrives under a WakaTime username and tickets under an Atlassian account
   * id, the same human occupies three rows that each hold a third of the story,
   * and no amount of sorting puts them back together.
   *
   * So accounts are resolved through the link table first, and everything is
   * accumulated against the resulting person key. An account nobody has linked
   * groups under itself and still gets a row — hiding it would hide every bot,
   * every service account, and everybody nobody has got round to linking, which
   * are exactly the rows that show the linking still needs doing.
   *
   * A person with coding time and no commits is a real row too, not an empty
   * one: a week spent in an editor without a single commit is worth seeing —
   * except on a call scoped to one repository, where the events are the only
   * thing that knows which repository somebody touched.
   */
  async run(input: {
    from: Date;
    to: Date;
    repositoryId?: string;
  }): Promise<ContributorSummary[]> {
    const day = toDay(input.to);

    const [events, wakaTimeRows, jiraRows, confluenceRows, snapshots, links, identities] =
      await Promise.all([
      this.options.store.listEvents({
        from: input.from,
        to: input.to,
        ...(input.repositoryId === undefined
          ? {}
          : { repositoryIds: [input.repositoryId] }),
      }),
      this.options.store.listContributorMetrics<WakaTimeMetrics>({
        source: "wakatime",
        from: toDay(input.from),
        to: day,
      }),
      // Jira is stored a day at a time, so the window can be answered honestly.
      this.options.store.listContributorMetrics<JiraContributorMetrics>({
        source: "jira",
        from: toDay(input.from),
        to: day,
      }),
      // Confluence is not: measuring written volume walks a page's version
      // bodies, and doing that per day would multiply the walks by the length
      // of the window. Its row therefore describes a trailing window, which the
      // column headings say rather than leaving a reader to assume.
      this.options.store.listLatestContributorMetrics<ConfluenceContributorMetrics>({
        source: "confluence",
        day,
      }),
      this.options.store.listLatestSnapshots({ day }),
      this.options.store.listIdentityLinks(),
      this.options.store.listIdentities(),
    ]);

    const people = new PersonDirectory({ links, identities });

    const sonarByRepository = new Map(
      snapshots.flatMap((snapshot) =>
        snapshot.payload.sonarMetrics === null
          ? []
          : [[snapshot.repositoryId, snapshot.payload.sonarMetrics] as const],
      ),
    );

    const byPerson = new Map<string, Accumulator>();
    const accumulatorFor = (identity: IdentityRef): Accumulator => {
      const key = people.keyOf(identity);
      const existing = byPerson.get(key) ?? empty();
      byPerson.set(key, existing);
      return existing;
    };

    /**
     * The same, but never inventing a row.
     *
     * Coding time, tickets and pages are measured for a person across
     * everything they touched, not per repository — so on a call scoped to one
     * repository they would otherwise add people who have never been near it.
     * Scoped, they only enrich somebody the events already put on the page; the
     * figures themselves stay whole-fleet, which the column help says.
     */
    const enrichOnly = (identity: IdentityRef): Accumulator | undefined => {
      if (input.repositoryId === undefined) return accumulatorFor(identity);
      return byPerson.get(people.keyOf(identity));
    };

    for (const event of events) {
      if (!event.actorKey) continue;
      const identity: IdentityRef = {
        source: "vcs",
        sourceKey: normalizeSourceKey(event.actorKey),
      };
      const accumulator = accumulatorFor(identity);
      remember(accumulator, identity, event.actorName);
      applyEvent(accumulator, event);
    }

    for (const row of wakaTimeRows) {
      const identity: IdentityRef = { source: "wakatime", sourceKey: row.contributorKey };
      const accumulator = enrichOnly(identity);
      if (accumulator === undefined) continue;
      remember(accumulator, identity, null);
      accumulator.wakaTime.push(row.payload);
    }

    for (const row of jiraRows) {
      const identity: IdentityRef = { source: "jira", sourceKey: row.contributorKey };
      const accumulator = enrichOnly(identity);
      if (accumulator === undefined) continue;
      remember(accumulator, identity, null);
      accumulator.jira.push(row.payload);
    }

    for (const [sourceKey, metrics] of confluenceRows) {
      const identity: IdentityRef = { source: "confluence", sourceKey };
      const accumulator = enrichOnly(identity);
      if (accumulator === undefined) continue;
      remember(accumulator, identity, null);
      accumulator.confluence.push(metrics);
    }

    // Only the people on this page are looked up, so the query is bounded by
    // who was active in the window rather than by the size of the directory.
    const users =
      this.options.directory === undefined
        ? new Map()
        : await this.options.directory.getUsersByRef(
            [...byPerson.keys()].filter((key) => key.startsWith("user:")),
          );

    return [...byPerson.entries()]
      .map(([key, totals]) => {
        const profile = people.profileOf(key, {
          displayName: totals.displayName,
          avatarUrl: totals.avatarUrl,
          profileUrl: totals.profileUrl,
        });
        const user = users.get(key);

        return {
          key,
          // The catalog is the organisation's own record of who somebody is, so
          // it outranks the name and photo a provider stamped on a commit.
          displayName:
            user?.displayName ?? profile.displayName ?? fallbackName(key, totals),
          avatarUrl: user?.picture ?? profile.avatarUrl,
          profileUrl: profile.profileUrl,
          entityRef: profile.entityRef,
          // Merged from what was actually seen in this window, unioned with what
          // the directory knows, so a row always names at least the account it
          // came from — including one the identity table has not recorded yet.
          identities: mergeIdentities(totals.identities, profile.identities),
          commits: totals.commits,
          linesAdded: totals.linesAdded,
          linesDeleted: totals.linesDeleted,
          // Floored at zero: a window in which someone mostly deleted code is a
          // legitimate contribution, not a negative one.
          linesOfCode: Math.max(0, totals.linesAdded - totals.linesDeleted),
          changedFiles: totals.changedFiles,
          churnUnit: churnUnitOf(totals),
          pullRequestsOpened: totals.pullRequestsOpened,
          pullRequestsMerged: totals.pullRequestsMerged,
          reviewsGiven: totals.reviewsGiven,
          reviewsApproved: totals.reviewsApproved,
          reviewsRejected: totals.reviewsRejected,
          prApprovalRate: computeRate(totals.reviewsApproved, totals.reviewsGiven),
          pipelineRuns: totals.pipelineRuns,
          pipelineRunsSucceeded: totals.pipelineRunsSucceeded,
          pipelineSuccessRate: computeRate(
            totals.pipelineRunsSucceeded,
            totals.pipelineRuns,
          ),
          repositories: totals.repositories.size,
          sonarMetrics: aggregateSonar(totals.repositories, sonarByRepository),
          wakaTimeMetrics: mergeWakaTimeMetrics(totals.wakaTime),
          jiraMetrics: mergeJiraContributorMetrics(totals.jira),
          confluenceMetrics: mergeConfluence(totals.confluence),
        };
      })
      .sort((left, right) => right.commits - left.commits);
  }
}


