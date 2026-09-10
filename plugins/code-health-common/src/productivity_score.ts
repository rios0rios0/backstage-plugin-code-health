import { confluenceContributions } from "./confluence_metrics";
import type { ContributorSummary } from "./contributor_summary";
import type { IntegrationCapabilities, IntegrationId } from "./integrations";
import { NO_INTEGRATIONS } from "./integrations";
import {
  combineScore,
  measuredComponent,
  shareOf,
  unmeasuredComponent,
  type Score,
  type ScoreComponent,
  type ScoreComponentDefinition,
} from "./score";
import { SONAR_COVERAGE_TARGET } from "./sonar_metrics";
import { formatDuration } from "./wakatime_metrics";

/**
 * A person's productivity over a window, as one number with its workings.
 *
 * These figures are read as a measure of people, so what goes into the number
 * matters more than the number. Four rules decide it:
 *
 * - **Output is measured against the fleet, not against a constant.** Commits,
 *   merged pull requests, churn and reviews — and, wherever the integration is
 *   configured, coding time, resolved tickets and documentation written — are
 *   each read as a share of the top figure anybody recorded in the same window.
 *   A quiet month for the whole team is then a quiet month, not everybody's
 *   failure, and there is no invented "forty commits is a good month" to argue
 *   with.
 * - **Reliability and quality are absolute.** A pipeline success rate, a
 *   quality gate, and the share of somebody's resolved tickets that stayed
 *   resolved mean the same thing whoever else is on the team.
 * - **What was not measured is left out, never scored as zero.** Somebody whose
 *   pipeline never ran has no success rate; somebody working on a repository
 *   with no Sonar project has an unknown gate; somebody with no WakaTime
 *   account linked to them has no coding time. Their weight goes to the
 *   components that could be measured, and `evidence` says how much survived.
 * - **Which components exist at all is decided by configuration.** An
 *   integration the backend was never configured with contributes no component
 *   rather than an unmeasured one, and the rest are renormalised over what is
 *   left. Inferring it from whether a row happens to carry a value cannot tell
 *   a switched-off integration from one that is on and has collected nothing
 *   yet, which would make a freshly configured install look as though half its
 *   people had stopped working.
 *
 * Sonar figures on a contributor row describe the repositories the person
 * changed the code of, not what they wrote — the same reading the table gives
 * them — which is why those two components carry the least weight.
 */
export type ProductivityScore = Score;

/**
 * The top figure anybody in the window recorded, per relative component.
 *
 * Churn is kept per unit because the two providers do not report the same
 * thing: GitHub reports lines, Azure DevOps reports files, and a person on one
 * platform is only ever compared with people measured in their own unit.
 *
 * The three integration figures skip a row whose metrics are null rather than
 * reading it as a zero. An account nobody has linked has not recorded no coding
 * time — nothing was ever asked on its behalf — and letting silence take part
 * in a maximum is only ever a way of getting the maximum wrong.
 */
export interface FleetReference {
  readonly commits: number;
  readonly pullRequestsMerged: number;
  readonly reviewsGiven: number;
  readonly linesOfCode: number;
  readonly changedFiles: number;
  readonly codingSeconds: number;
  readonly issuesResolved: number;
  readonly documentationContributions: number;
}

export const EMPTY_FLEET_REFERENCE: FleetReference = {
  commits: 0,
  pullRequestsMerged: 0,
  reviewsGiven: 0,
  linesOfCode: 0,
  changedFiles: 0,
  codingSeconds: 0,
  issuesResolved: 0,
  documentationContributions: 0,
};

export const fleetReferenceOf = (
  contributors: readonly ContributorSummary[],
): FleetReference =>
  contributors.reduce<FleetReference>(
    (reference, contributor) => ({
      commits: Math.max(reference.commits, contributor.commits),
      pullRequestsMerged: Math.max(
        reference.pullRequestsMerged,
        contributor.pullRequestsMerged,
      ),
      reviewsGiven: Math.max(reference.reviewsGiven, contributor.reviewsGiven),
      linesOfCode:
        contributor.churnUnit === "lines"
          ? Math.max(reference.linesOfCode, contributor.linesOfCode)
          : reference.linesOfCode,
      changedFiles:
        contributor.churnUnit === "files"
          ? Math.max(reference.changedFiles, contributor.changedFiles)
          : reference.changedFiles,
      codingSeconds: Math.max(
        reference.codingSeconds,
        contributor.wakaTimeMetrics?.totalSeconds ?? 0,
      ),
      issuesResolved: Math.max(
        reference.issuesResolved,
        contributor.jiraMetrics?.issuesResolved ?? 0,
      ),
      documentationContributions: Math.max(
        reference.documentationContributions,
        contributor.confluenceMetrics === null
          ? 0
          : confluenceContributions(contributor.confluenceMetrics),
      ),
    }),
    EMPTY_FLEET_REFERENCE,
  );

/**
 * Every component, with the weight it carries before renormalisation.
 *
 * These are *nominal*: with all three integrations configured they add up to
 * 1.40 rather than to one, and {@link productivityComponentsFor} is what shares
 * them out over whatever is switched on. Declaring them this way lets a weight
 * say what its component is worth against the others rather than against a
 * total that differs per install — turning Jira on should not mean rewriting
 * the six numbers it has nothing to do with.
 */
export const PRODUCTIVITY_COMPONENTS = {
  commits: { id: "commits", label: "Commits", weight: 0.2 },
  pullRequestsMerged: {
    id: "pullRequestsMerged",
    label: "Pull requests merged",
    weight: 0.2,
  },
  churn: { id: "churn", label: "Code churn", weight: 0.1 },
  reviewsGiven: { id: "reviewsGiven", label: "Reviews given", weight: 0.15 },
  pipelineSuccessRate: {
    id: "pipelineSuccessRate",
    label: "Pipeline success",
    weight: 0.15,
  },
  qualityGate: {
    id: "qualityGate",
    label: "Quality gate of code touched",
    weight: 0.1,
  },
  coverage: {
    id: "coverage",
    label: "Test coverage of code touched",
    weight: 0.1,
  },
  codingTime: { id: "codingTime", label: "Coding time", weight: 0.1 },
  ticketsResolved: {
    id: "ticketsResolved",
    label: "Tickets resolved",
    weight: 0.15,
  },
  reopened: { id: "reopened", label: "Tickets that stayed done", weight: 0.05 },
  documentation: {
    id: "documentation",
    label: "Documentation written",
    weight: 0.1,
  },
} as const satisfies Record<string, ScoreComponentDefinition>;

/** Every component the productivity score knows how to read. */
export type ProductivityComponentId = keyof typeof PRODUCTIVITY_COMPONENTS;

/** A component's fixed part, with its id narrowed to the ones above. */
export interface ProductivityComponentDefinition extends ScoreComponentDefinition {
  readonly id: ProductivityComponentId;
}

const plural = (count: number, noun: string): string =>
  `${count.toLocaleString()} ${noun}${count === 1 ? "" : "s"}`;

/**
 * A figure read against the fleet's top figure in the same window.
 *
 * With nobody recording any, the component is unmeasurable rather than zero:
 * a week in which no pull request merged anywhere says nothing about anyone.
 */
const relative = (
  definition: ScoreComponentDefinition,
  value: number,
  top: number,
  noun: string,
): ScoreComponent =>
  top <= 0
    ? unmeasuredComponent(definition, `nobody recorded any ${noun}s in this window`)
    : measuredComponent(
        definition,
        value,
        shareOf(value, top),
        `${plural(value, noun)} against the window's top figure of ${top.toLocaleString()}`,
      );

const churnOf = (
  definition: ScoreComponentDefinition,
  summary: ContributorSummary,
  reference: FleetReference,
): ScoreComponent => {
  if (summary.churnUnit === "lines") {
    return relative(definition, summary.linesOfCode, reference.linesOfCode, "net line");
  }
  if (summary.churnUnit === "files") {
    return relative(definition, summary.changedFiles, reference.changedFiles, "changed file");
  }
  return unmeasuredComponent(definition, "the provider reported no churn figure");
};

const pipelineOf = (
  definition: ScoreComponentDefinition,
  summary: ContributorSummary,
): ScoreComponent => {
  const decided = summary.pipelineRunsSucceeded + summary.pipelineRunsFailed;
  if (decided === 0) {
    return unmeasuredComponent(definition, "no pipeline run reached a verdict");
  }
  return measuredComponent(
    definition,
    summary.pipelineSuccessRate,
    summary.pipelineRunsSucceeded / decided,
    `${summary.pipelineRunsSucceeded.toLocaleString()} of ${plural(decided, "decided run")} succeeded`,
  );
};

const qualityGateOf = (
  definition: ScoreComponentDefinition,
  summary: ContributorSummary,
): ScoreComponent => {
  const sonar = summary.sonarMetrics;
  if (sonar === null || sonar.qualityGateStatus === "NONE") {
    return unmeasuredComponent(definition, "no Sonar project measures the code touched");
  }
  const passing = sonar.qualityGateStatus === "OK";
  return measuredComponent(
    definition,
    passing ? 1 : 0,
    passing ? 1 : 0,
    passing
      ? "every repository touched passes its quality gate"
      : "a repository touched is failing its quality gate",
  );
};

const coverageOf = (
  definition: ScoreComponentDefinition,
  summary: ContributorSummary,
): ScoreComponent => {
  const sonar = summary.sonarMetrics;
  if (sonar === null) {
    return unmeasuredComponent(definition, "no Sonar project measures the code touched");
  }
  return measuredComponent(
    definition,
    sonar.coverage,
    shareOf(sonar.coverage, SONAR_COVERAGE_TARGET),
    `${sonar.coverage.toFixed(1)}% covered, against the ${SONAR_COVERAGE_TARGET}% gate`,
  );
};

/**
 * Coding time, against whoever logged the most of it in the window.
 *
 * Phrased in hours and minutes rather than in seconds because the sentence is
 * only ever read by a person, and thirty thousand of anything is not a duration
 * anybody can picture.
 *
 * An unlinked account is named as the cause rather than folded into the generic
 * "nothing was measured", because it is the one reason the figure can be
 * missing that somebody can go and fix, on the Identities screen.
 */
const codingTimeOf = (
  definition: ScoreComponentDefinition,
  summary: ContributorSummary,
  reference: FleetReference,
): ScoreComponent => {
  const wakaTime = summary.wakaTimeMetrics;
  if (wakaTime === null) {
    return unmeasuredComponent(definition, "no WakaTime account is linked to this person");
  }
  if (reference.codingSeconds <= 0) {
    return unmeasuredComponent(definition, "nobody recorded any coding time in this window");
  }
  return measuredComponent(
    definition,
    wakaTime.totalSeconds,
    shareOf(wakaTime.totalSeconds, reference.codingSeconds),
    `${formatDuration(wakaTime.totalSeconds)} against the window's top figure of ${formatDuration(
      reference.codingSeconds,
    )}`,
  );
};

const ticketsResolvedOf = (
  definition: ScoreComponentDefinition,
  summary: ContributorSummary,
  reference: FleetReference,
): ScoreComponent => {
  const jira = summary.jiraMetrics;
  if (jira === null) {
    return unmeasuredComponent(definition, "no Jira account is linked to this person");
  }
  return relative(definition, jira.issuesResolved, reference.issuesResolved, "resolved ticket");
};

/**
 * How much of somebody's resolved work stayed resolved.
 *
 * Absolute rather than relative, and the only Jira component that is: a ticket
 * coming back is a fact about that ticket, not a race against how often other
 * people's came back. Capped at one so a fortnight in which everything reopened
 * scores zero rather than below it, and unmeasured with nothing resolved —
 * somebody who closed no ticket has not failed to keep any closed.
 */
const reopenedOf = (
  definition: ScoreComponentDefinition,
  summary: ContributorSummary,
): ScoreComponent => {
  const jira = summary.jiraMetrics;
  if (jira === null) {
    return unmeasuredComponent(definition, "no Jira account is linked to this person");
  }
  if (jira.issuesResolved <= 0) {
    return unmeasuredComponent(definition, "no ticket resolved");
  }
  return measuredComponent(
    definition,
    jira.reopened,
    1 - Math.min(1, jira.reopened / jira.issuesResolved),
    `${jira.reopened.toLocaleString()} of ${plural(jira.issuesResolved, "resolved ticket")} ${
      jira.reopened === 1 ? "was" : "were"
    } reopened`,
  );
};

/**
 * Documentation written, read against the fleet's top figure — but over
 * Confluence's own trailing window, not the one the reader picked.
 *
 * Confluence is the one integration stored per window rather than per day: its
 * figures describe the backend's trailing `atlassian.historyDays` and do not
 * move with the range picker, so this component cannot honestly claim "in the
 * same window" the way coding time and tickets can. The detail says so rather
 * than borrowing the wording of the other relative components, because a
 * ninety-day figure labelled as "last 24 hours" is exactly the misreading the
 * rest of the dashboard refuses to leave implicit.
 */
const documentationOf = (
  definition: ScoreComponentDefinition,
  summary: ContributorSummary,
  reference: FleetReference,
): ScoreComponent => {
  const confluence = summary.confluenceMetrics;
  if (confluence === null) {
    return unmeasuredComponent(definition, "no Confluence account is linked to this person");
  }
  const top = reference.documentationContributions;
  if (top <= 0) {
    return unmeasuredComponent(
      definition,
      "nobody recorded any Confluence contributions over Confluence's trailing window",
    );
  }
  const value = confluenceContributions(confluence);
  return measuredComponent(
    definition,
    value,
    shareOf(value, top),
    `${plural(value, "Confluence contribution")} against the top figure of ${top.toLocaleString()} over Confluence's trailing window, not the range picked`,
  );
};

/** How one component is read, and what has to be configured for it to exist. */
interface ComponentReading {
  /**
   * The integration this component needs, or null when it is always part of the
   * score. Configuration decides this, never whether a row carries a value.
   */
  readonly integration: IntegrationId | null;
  readonly read: (
    definition: ProductivityComponentDefinition,
    summary: ContributorSummary,
    reference: FleetReference,
  ) => ScoreComponent;
}

/**
 * Component to its reading, in the order a reader meets them.
 *
 * A lookup rather than a chain of conditionals, so adding a component means
 * adding an entry here and one in {@link PRODUCTIVITY_COMPONENTS} — and the two
 * cannot drift, because the type requires an entry for every id.
 */
const READINGS: Readonly<Record<ProductivityComponentId, ComponentReading>> = {
  commits: {
    integration: null,
    read: (definition, summary, reference) =>
      relative(definition, summary.commits, reference.commits, "commit"),
  },
  pullRequestsMerged: {
    integration: null,
    read: (definition, summary, reference) =>
      relative(
        definition,
        summary.pullRequestsMerged,
        reference.pullRequestsMerged,
        "merged pull request",
      ),
  },
  churn: { integration: null, read: churnOf },
  reviewsGiven: {
    integration: null,
    read: (definition, summary, reference) =>
      relative(definition, summary.reviewsGiven, reference.reviewsGiven, "review"),
  },
  pipelineSuccessRate: { integration: null, read: pipelineOf },
  qualityGate: { integration: null, read: qualityGateOf },
  coverage: { integration: null, read: coverageOf },
  codingTime: { integration: "wakatime", read: codingTimeOf },
  ticketsResolved: { integration: "jira", read: ticketsResolvedOf },
  reopened: { integration: "jira", read: reopenedOf },
  documentation: { integration: "confluence", read: documentationOf },
};

/**
 * The components a given install actually scores on, weighted to sum to one.
 *
 * Exported because the number and every sentence explaining it have to come
 * from the same place. The weights move with configuration — with all three
 * integrations on, commits carry 0.2/1.4, about 14%, rather than 20% — so a
 * column header, a card subheader or a page of documentation that wrote those
 * percentages out by hand would be wrong on most installs, and wrong in a way
 * nobody would ever notice.
 */
export const productivityComponentsFor = (
  capabilities: IntegrationCapabilities = NO_INTEGRATIONS,
): readonly ProductivityComponentDefinition[] => {
  const enabled = Object.values(PRODUCTIVITY_COMPONENTS).filter((definition) => {
    const { integration } = READINGS[definition.id];
    return integration === null || capabilities[integration];
  });
  const nominal = enabled.reduce((total, definition) => total + definition.weight, 0);

  return enabled.map((definition) => ({ ...definition, weight: definition.weight / nominal }));
};

export const computeProductivityScore = (
  summary: ContributorSummary,
  reference: FleetReference,
  capabilities: IntegrationCapabilities = NO_INTEGRATIONS,
): ProductivityScore =>
  combineScore(
    productivityComponentsFor(capabilities).map((definition) =>
      READINGS[definition.id].read(definition, summary, reference),
    ),
  );
