import type {
  ApiExposure,
  ApiExposureState,
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

const API_STYLES: Record<ApiExposureState, { tone: ChipTone; label: string }> = {
  declared: { tone: "success", label: "Declared" },
  candidate: { tone: "error", label: "Undeclared" },
  expected: { tone: "warning", label: "Likely" },
  none: { tone: "neutral", label: "None" },
};

const API_TITLES: Record<ApiExposureState, string> = {
  declared: "The catalog entity names at least one API in `spec.providesApis`.",
  candidate:
    "An API definition was found in the repository, but the catalog entity declares no API. Adding a `spec.providesApis` entry makes it visible in the API explorer.",
  expected:
    "No definition file was found, but the entity is typed as something that serves traffic and declares no API. A weaker signal than a definition file.",
  none: "Nothing suggests this repository exposes an API.",
};

export const ApiExposureBadge = ({ exposure }: { exposure: ApiExposure | null }) => {
  if (!exposure) return <EmptyCell />;

  const { tone, label } = API_STYLES[exposure.state];
  const title =
    exposure.definitionPath === null
      ? API_TITLES[exposure.state]
      : `${API_TITLES[exposure.state]}\nFound: ${exposure.definitionPath}`;

  return <StateChip tone={tone} label={label} title={title} />;
};
