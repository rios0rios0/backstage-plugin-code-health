import type { ContributorSummary } from "./contributor_summary";
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

/**
 * A person's productivity over a window, as one number with its workings.
 *
 * These figures are read as a measure of people, so what goes into the number
 * matters more than the number. Three rules decide it:
 *
 * - **Output is measured against the fleet, not against a constant.** Commits,
 *   merged pull requests, churn and reviews are each read as a share of the
 *   top figure anybody recorded in the same window. A quiet month for the whole
 *   team is then a quiet month, not everybody's failure, and there is no
 *   invented "forty commits is a good month" to argue with.
 * - **Reliability and quality are absolute.** A pipeline success rate and a
 *   quality gate mean the same thing whoever else is on the team.
 * - **What was not measured is left out, never scored as zero.** Somebody whose
 *   pipeline never ran has no success rate; somebody working on a repository
 *   with no Sonar project has an unknown gate. Their weight goes to the
 *   components that could be measured, and `evidence` says how much survived.
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
 */
export interface FleetReference {
  readonly commits: number;
  readonly pullRequestsMerged: number;
  readonly reviewsGiven: number;
  readonly linesOfCode: number;
  readonly changedFiles: number;
}

export const EMPTY_FLEET_REFERENCE: FleetReference = {
  commits: 0,
  pullRequestsMerged: 0,
  reviewsGiven: 0,
  linesOfCode: 0,
  changedFiles: 0,
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
    }),
    EMPTY_FLEET_REFERENCE,
  );

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
} as const satisfies Record<string, ScoreComponentDefinition>;

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

const churnOf = (summary: ContributorSummary, reference: FleetReference): ScoreComponent => {
  const definition = PRODUCTIVITY_COMPONENTS.churn;
  if (summary.churnUnit === "lines") {
    return relative(definition, summary.linesOfCode, reference.linesOfCode, "net line");
  }
  if (summary.churnUnit === "files") {
    return relative(definition, summary.changedFiles, reference.changedFiles, "changed file");
  }
  return unmeasuredComponent(definition, "the provider reported no churn figure");
};

const pipelineOf = (summary: ContributorSummary): ScoreComponent => {
  const definition = PRODUCTIVITY_COMPONENTS.pipelineSuccessRate;
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

const qualityGateOf = (summary: ContributorSummary): ScoreComponent => {
  const definition = PRODUCTIVITY_COMPONENTS.qualityGate;
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

const coverageOf = (summary: ContributorSummary): ScoreComponent => {
  const definition = PRODUCTIVITY_COMPONENTS.coverage;
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

export const computeProductivityScore = (
  summary: ContributorSummary,
  reference: FleetReference,
): ProductivityScore =>
  combineScore([
    relative(PRODUCTIVITY_COMPONENTS.commits, summary.commits, reference.commits, "commit"),
    relative(
      PRODUCTIVITY_COMPONENTS.pullRequestsMerged,
      summary.pullRequestsMerged,
      reference.pullRequestsMerged,
      "merged pull request",
    ),
    churnOf(summary, reference),
    relative(
      PRODUCTIVITY_COMPONENTS.reviewsGiven,
      summary.reviewsGiven,
      reference.reviewsGiven,
      "review",
    ),
    pipelineOf(summary),
    qualityGateOf(summary),
    coverageOf(summary),
  ]);
