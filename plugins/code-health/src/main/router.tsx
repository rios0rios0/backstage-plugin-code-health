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
import type { ReactNode } from "react";
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
 * One tab's body, or the reachability warning in its place.
 *
 * Every tab needs the same guard, and repeating the panel three times is how
 * the three copies drifted into saying different things about the same failure.
 */
const TabBody = ({ error, children }: { error: string | null; children: ReactNode }) => {
  if (error === null) return <>{children}</>;

  return (
    <Box mb={2}>
      <WarningPanel
        severity="error"
        title="The Code Health backend is not reachable"
        message={`${error}. Install @rios0rios0/backstage-plugin-code-health-backend in your Backstage backend.`}
        defaultExpanded
      />
    </Box>
  );
};

/**
 * Routable entry point of the plugin.
 *
 * The credential gate this used to open with is gone. There is nothing for a
 * user to configure: the backend discovers repositories from the catalog and
 * authenticates through the host application's `integrations` block, so the
 * only thing worth checking before rendering is whether that backend is
 * reachable.
 *
 * Insights is the landing tab. It is the only one that answers a question about
 * the fleet rather than about one row of it, so it is what someone opening the
 * plugin cold wants first; contributors and repositories are the drill-down.
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
          <TabbedLayout.Route path="/" title="Insights">
            <TabBody error={coverage.error}>
              <InsightsPage
                dashboardService={dashboardService}
                contributorService={contributorService}
                timeSeriesService={timeSeriesService}
                coverage={coverage}
                config={config}
              />
            </TabBody>
          </TabbedLayout.Route>

          <TabbedLayout.Route path="/contributors" title="Contributors">
            <TabBody error={coverage.error}>
              <ContributorsPage
                contributorService={contributorService}
                coverage={coverage}
                config={config}
              />
            </TabBody>
          </TabbedLayout.Route>

          <TabbedLayout.Route path="/repositories" title="Repositories">
            <TabBody error={coverage.error}>
              <DashboardPage
                dashboardService={dashboardService}
                coverage={coverage}
                config={config}
              />
            </TabBody>
          </TabbedLayout.Route>
        </TabbedLayout>
      )}
    </Page>
  );
};
