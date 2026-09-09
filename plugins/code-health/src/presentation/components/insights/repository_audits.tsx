import { InfoCard } from "@backstage/core-components";
import Box from "@material-ui/core/Box";
import Divider from "@material-ui/core/Divider";
import Grid from "@material-ui/core/Grid";
import Typography from "@material-ui/core/Typography";
import type { RepositorySummary } from "@rios0rios0/backstage-plugin-code-health-common";
import { useMemo } from "react";
import {
  apiCandidates,
  apiExposureBreakdown,
  complianceBreakdown,
  documentationBreakdown,
  qualityGateBreakdown,
  undocumented,
  unpublishedDocumentation,
} from "../../../domain/entities/insights";
import { GapList } from "../charts/gap_list";
import { StatusBreakdown } from "../charts/status_breakdown";

export interface RepositoryAuditsProps {
  readonly repositories: readonly RepositorySummary[];
}

/**
 * The three findings that are answered by editing a repository.
 *
 * Documentation, catalog APIs and policy compliance all name repositories and
 * are all closed by a change to one — a `techdocs-ref` annotation, a
 * `providesApis` entry, a branch policy. They sit above the repositories table
 * because that is the list a reader is about to work through, and because none
 * of them is a fleet-level question the way a cadence or a coverage
 * distribution is.
 *
 * Rendered as `Grid item` children so the page composes them into its own grid,
 * the same way the optional integration sections do.
 */
export const RepositoryAudits = ({ repositories }: RepositoryAuditsProps) => {
  const documentation = useMemo(
    () => documentationBreakdown(repositories),
    [repositories],
  );
  const docsUnpublished = useMemo(
    () => unpublishedDocumentation(repositories),
    [repositories],
  );
  const docsMissing = useMemo(() => undocumented(repositories), [repositories]);
  const apiSlices = useMemo(() => apiExposureBreakdown(repositories), [repositories]);
  const apiGaps = useMemo(() => apiCandidates(repositories), [repositories]);
  const qualityGates = useMemo(() => qualityGateBreakdown(repositories), [repositories]);
  const compliance = useMemo(() => complianceBreakdown(repositories), [repositories]);

  return (
    <>
      <Grid item xs={12} md={4}>
        <InfoCard
          title="Documentation"
          subheader="Where TechDocs is wired up, and where the docs exist but nobody pointed at them"
        >
          <StatusBreakdown slices={documentation} />
          <Box my={2}>
            <Divider />
          </Box>
          <Box mb={1} fontWeight={500}>
            Written but not published
          </Box>
          <GapList
            gaps={docsUnpublished}
            emptyMessage="Every repository that writes documentation publishes it."
          />
          <Box my={2}>
            <Divider />
          </Box>
          <Box mb={1} fontWeight={500}>
            No documentation at all
          </Box>
          <GapList
            gaps={docsMissing}
            emptyMessage="Nothing in the fleet is completely undocumented."
          />
        </InfoCard>
      </Grid>

      <Grid item xs={12} md={4}>
        <InfoCard
          title="Catalog APIs"
          subheader="Repositories that could be an API entity in the catalog and are not"
        >
          <StatusBreakdown slices={apiSlices} />
          <Box my={2}>
            <Divider />
          </Box>
          <Box mb={1} fontWeight={500}>
            Missing a `providesApis` entry
          </Box>
          <GapList
            gaps={apiGaps}
            emptyMessage="Every repository that looks like it serves an API already declares one."
          />
          <Box mt={2}>
            <Typography variant="caption" color="textSecondary">
              A path is a definition found in the repository; “typed as a service” is
              inferred from the entity’s `spec.type` alone and is the weaker signal.
            </Typography>
          </Box>
        </InfoCard>
      </Grid>

      <Grid item xs={12} md={4}>
        <InfoCard title="Fleet health">
          <Box mb={1} fontWeight={500}>
            Quality gates
          </Box>
          <StatusBreakdown slices={qualityGates} />
          <Box my={2}>
            <Divider />
          </Box>
          <Box mb={1} fontWeight={500}>
            Branch and build policy
          </Box>
          <StatusBreakdown slices={compliance} />
        </InfoCard>
      </Grid>
    </>
  );
};
