import { ContentHeader } from "@backstage/core-components";
import type { IntegrationCapabilities } from "@rios0rios0/backstage-plugin-code-health-common";
import Typography from "@material-ui/core/Typography";
import { useParams } from "react-router-dom";
import type {
  ContributorService,
  TrendService,
} from "../../domain/services/dashboard_service";
import type { UseCoverageResult } from "../hooks/use_coverage";

export interface RepositoryDetailPageProps {
  readonly trendService: TrendService;
  readonly contributorService: ContributorService;
  readonly coverage: UseCoverageResult;
  readonly capabilities: IntegrationCapabilities;
}

/**
 * One repository over the last one to six months.
 *
 * Placeholder: the trend charts and the health score are built by the
 * repository-detail work; this keeps the route mounted and the props wired in
 * the meantime.
 */
export const RepositoryDetailPage = (_props: RepositoryDetailPageProps) => {
  const { id } = useParams<{ id: string }>();

  return (
    <>
      <ContentHeader title="Repository" />
      <Typography variant="body2" color="textSecondary">
        {id ?? "No repository was named."}
      </Typography>
    </>
  );
};
