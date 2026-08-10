export type CIState = "SUCCESS" | "FAILURE" | "PENDING" | "ERROR" | "EXPECTED" | "NONE";

export const CI_STATES: readonly CIState[] = [
  "SUCCESS",
  "FAILURE",
  "PENDING",
  "ERROR",
  "EXPECTED",
  "NONE",
];

export const isCIState = (value: string): value is CIState =>
  (CI_STATES as readonly string[]).includes(value);

/** The most recent pipeline or workflow outcome on a repository's default branch. */
export interface WorkflowStatus {
  readonly state: CIState;
  readonly commitSha: string;
  readonly commitMessage: string;
  readonly commitUrl: string;
}
