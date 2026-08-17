import {
  Content,
  Header,
  Page,
  Progress,
  TabbedLayout,
  WarningPanel,
} from "@backstage/core-components";
import { useApi } from "@backstage/core-plugin-api";
import Box from "@material-ui/core/Box";
import { ThemeToggleButton } from "../presentation/components/theme_toggle_button";
import { useCoverage } from "../presentation/hooks/use_coverage";
import { ContributorsPage } from "../presentation/pages/contributors_page";
import { DashboardPage } from "../presentation/pages/dashboard_page";
import { InsightsPage } from "../presentation/pages/insights_page";
import {
  codeHealthConfigApiRef,
  codeHealthContributorsApiRef,
  codeHealthCoverageApiRef,
  codeHealthRepositoriesApiRef,
  codeHealthTimeSeriesApiRef,
} from "./api_refs";

/**
 * Routable entry point of the plugin.
 *
 * The credential gate this used to open with is gone. There is nothing for a
 * user to configure: the backend discovers repositories from the catalog and
 * authenticates through the host application's `integrations` block, so the
 * only thing worth checking before rendering is whether that backend is
 * reachable.
 */
export const Router = () => {
  const config = useApi(codeHealthConfigApiRef);
  const dashboardService = useApi(codeHealthRepositoriesApiRef);
  const contributorService = useApi(codeHealthContributorsApiRef);
  const coverageService = useApi(codeHealthCoverageApiRef);
  const timeSeriesService = useApi(codeHealthTimeSeriesApiRef);
  const coverage = useCoverage(coverageService);

  return (
    <Page themeId="tool">
      <Header title="Code Health" subtitle="Repository health across your catalog">
        <ThemeToggleButton />
      </Header>

      {coverage.isLoading && !coverage.coverage ? (
        <Content>
          <Progress />
        </Content>
      ) : (
        <TabbedLayout>
          <TabbedLayout.Route path="/" title="Repositories">
            {coverage.error ? (
              <Box mb={2}>
                <WarningPanel
                  severity="error"
                  title="The Code Health backend is not reachable"
                  message={`${coverage.error}. Install @rios0rios0/backstage-plugin-code-health-backend in your Backstage backend.`}
                  defaultExpanded
                />
              </Box>
            ) : (
              <DashboardPage
                dashboardService={dashboardService}
                coverage={coverage}
                config={config}
              />
            )}
          </TabbedLayout.Route>

          <TabbedLayout.Route path="/contributors" title="Contributors">
            {coverage.error ? (
              <Box mb={2}>
                <WarningPanel
                  severity="error"
                  title="The Code Health backend is not reachable"
                  message={coverage.error}
                  defaultExpanded
                />
              </Box>
            ) : (
              <ContributorsPage
                contributorService={contributorService}
                coverage={coverage}
                config={config}
              />
            )}
          </TabbedLayout.Route>

          <TabbedLayout.Route path="/insights" title="Insights">
            {coverage.error ? (
              <Box mb={2}>
                <WarningPanel
                  severity="error"
                  title="The Code Health backend is not reachable"
                  message={coverage.error}
                  defaultExpanded
                />
              </Box>
            ) : (
              <InsightsPage
                dashboardService={dashboardService}
                contributorService={contributorService}
                timeSeriesService={timeSeriesService}
                coverage={coverage}
                config={config}
              />
            )}
          </TabbedLayout.Route>
        </TabbedLayout>
      )}
    </Page>
  );
};
