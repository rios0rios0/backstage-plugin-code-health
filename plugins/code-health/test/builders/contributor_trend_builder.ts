import type {
  ContributorSummary,
  ContributorTrendPoint,
  FleetReference,
  ProductivityScore,
} from "@rios0rios0/backstage-plugin-code-health-common";
import {
  computeProductivityScore,
  fleetReferenceOf,
} from "@rios0rios0/backstage-plugin-code-health-common";

/**
 * One bucket of a person's history.
 *
 * The score is computed rather than invented, by the same function the backend
 * uses, so a test asserting on a chart of scores is asserting on the arithmetic
 * that actually ships. The reference defaults to the bucket's own row, which
 * makes a lone contributor the top figure in their own window — the shape a
 * one-person fixture would really have.
 */
export const aTrendPoint = (
  day: string,
  summary: ContributorSummary,
  reference: FleetReference = fleetReferenceOf([summary]),
): ContributorTrendPoint => ({
  day,
  summary,
  score: computeProductivityScore(summary, reference),
});

const unmeasurableScore = (): ProductivityScore => ({
  value: null,
  evidence: 0,
  components: [],
});

/** A bucket whose score nothing could be read from, e.g. a week nobody worked. */
export const anUnscoredTrendPoint = (
  day: string,
  summary: ContributorSummary,
): ContributorTrendPoint => ({
  day,
  summary,
  score: unmeasurableScore(),
});
