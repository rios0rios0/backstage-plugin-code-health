import type { ComplianceColor, ComplianceStatus } from "../../domain/entities/compliance_status";
import { EmptyCell } from "./empty_cell";
import type { ChipTone } from "./state_chip";
import { StateChip } from "./state_chip";

const COLOR_STYLES: Record<ComplianceColor, { tone: ChipTone; label: string }> = {
  green: { tone: "success", label: "Compliant" },
  yellow: { tone: "warning", label: "Partial" },
  red: { tone: "error", label: "Non-compliant" },
};

interface ComplianceBadgeProps {
  status: ComplianceStatus | null;
}

export const ComplianceBadge = ({ status }: ComplianceBadgeProps) => {
  if (!status) return <EmptyCell />;

  const { tone, label } = COLOR_STYLES[status.color];
  const checks = [
    { label: "Pipeline exists", ok: status.pipelineExists },
    { label: "Build policy on PRs", ok: status.buildPolicyOnPRs },
    { label: "Build policy expiration", ok: status.buildPolicyExpiration },
    { label: "Branch protection", ok: status.branchProtection },
  ];
  const title = checks.map((c) => `${c.ok ? "✓" : "✗"} ${c.label}`).join("\n");

  return <StateChip tone={tone} label={label} title={title} />;
};
