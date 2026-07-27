import type { CIState } from "../../domain/entities/workflow_status";
import type { ChipTone } from "./state_chip";
import { StateChip } from "./state_chip";

const STATE_STYLES: Record<CIState | "NONE", { tone: ChipTone; label: string }> = {
  SUCCESS: { tone: "success", label: "Passing" },
  FAILURE: { tone: "error", label: "Failing" },
  ERROR: { tone: "error", label: "Error" },
  PENDING: { tone: "warning", label: "Pending" },
  EXPECTED: { tone: "info", label: "Expected" },
  NONE: { tone: "neutral", label: "No CI" },
};

interface StatusBadgeProps {
  state: CIState | null;
}

export const StatusBadge = ({ state }: StatusBadgeProps) => {
  const { tone, label } = STATE_STYLES[state ?? "NONE"];
  return <StateChip tone={tone} label={label} />;
};
