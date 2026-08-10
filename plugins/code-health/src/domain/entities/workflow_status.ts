export type CIState = "SUCCESS" | "FAILURE" | "PENDING" | "ERROR" | "EXPECTED" | "NONE";

export interface WorkflowStatus {
  readonly state: CIState;
  readonly commitSha: string;
  readonly commitMessage: string;
  readonly commitUrl: string;
}
