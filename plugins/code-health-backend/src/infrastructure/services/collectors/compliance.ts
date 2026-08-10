import type { ComplianceStatus } from "@rios0rios0/backstage-plugin-code-health-common";
import { computeComplianceColor } from "@rios0rios0/backstage-plugin-code-health-common";

/**
 * Assembles a compliance status and derives its colour from the same rule both
 * providers and the dashboard use, so the four checks and the badge beside them
 * can never disagree.
 */
export const buildCompliance = (checks: {
  pipelineExists: boolean;
  buildPolicyOnPRs: boolean;
  buildPolicyExpiration: boolean;
  branchProtection: boolean;
}): ComplianceStatus => ({
  ...checks,
  color: computeComplianceColor([
    checks.pipelineExists,
    checks.buildPolicyOnPRs,
    checks.buildPolicyExpiration,
    checks.branchProtection,
  ]),
});
