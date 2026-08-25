import type {
  DocumentationState,
  DocumentationStatus,
} from "@rios0rios0/backstage-plugin-code-health-common";
import { EmptyCell } from "./empty_cell";
import type { ChipTone } from "./state_chip";
import { StateChip } from "./state_chip";

const DOCUMENTATION_STYLES: Record<
  DocumentationState,
  { tone: ChipTone; label: string }
> = {
  documented: { tone: "success", label: "TechDocs" },
  unpublished: { tone: "warning", label: "Unpublished" },
  missing: { tone: "error", label: "None" },
  "not-expected": { tone: "neutral", label: "Archived" },
};

export const DocumentationBadge = ({
  status,
}: {
  status: DocumentationStatus | null;
}) => {
  if (!status) return <EmptyCell />;

  const { tone, label } = DOCUMENTATION_STYLES[status.state];
  // The same four checks the grade was computed from, so a reader can see why a
  // repository landed where it did without going to look at the entity.
  const title = [
    { label: "TechDocs annotation", ok: status.hasTechDocs },
    { label: "Docs in the repository", ok: status.hasDocsSource },
    { label: "README", ok: status.hasReadme },
    { label: "Link to external docs", ok: status.hasExternalDocs },
  ]
    .map((check) => `${check.ok ? "✓" : "✗"} ${check.label}`)
    .join("\n");

  return <StateChip tone={tone} label={label} title={title} />;
};
