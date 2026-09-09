import { ContentHeader } from "@backstage/core-components";
import type { IntegrationCapabilities } from "@rios0rios0/backstage-plugin-code-health-common";
import Typography from "@material-ui/core/Typography";
import { useSearchParams } from "react-router-dom";
import type {
  OwnershipService,
  TrendService,
} from "../../domain/services/dashboard_service";
import type { UseCoverageResult } from "../hooks/use_coverage";

export interface ContributorDetailPageProps {
  readonly trendService: TrendService;
  readonly ownershipService: OwnershipService;
  readonly coverage: UseCoverageResult;
  readonly capabilities: IntegrationCapabilities;
}

/** The query parameter the Contributors tab links a person's detail page with. */
export const CONTRIBUTOR_KEY_PARAM = "key";

/**
 * One person over the last one to six months.
 *
 * Placeholder: the trend charts, the productivity score and the owned
 * repositories are built by the contributor-detail work; this keeps the route
 * mounted and the props wired in the meantime.
 */
export const ContributorDetailPage = (_props: ContributorDetailPageProps) => {
  const [parameters] = useSearchParams();
  const key = parameters.get(CONTRIBUTOR_KEY_PARAM);

  return (
    <>
      <ContentHeader title="Contributor" />
      <Typography variant="body2" color="textSecondary">
        {key === null ? "No contributor was named." : key}
      </Typography>
    </>
  );
};
