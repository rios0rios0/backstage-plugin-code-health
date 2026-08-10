export type ComplianceColor = "green" | "yellow" | "red";

export interface ComplianceStatus {
  readonly pipelineExists: boolean;
  readonly buildPolicyOnPRs: boolean;
  readonly buildPolicyExpiration: boolean;
  readonly branchProtection: boolean;
  readonly color: ComplianceColor;
}

export const computeComplianceColor = (checks: boolean[]): ComplianceColor => {
  const failCount = checks.filter((v) => !v).length;
  if (failCount === 0) return "green";
  if (failCount === 1) return "yellow";
  return "red";
};
