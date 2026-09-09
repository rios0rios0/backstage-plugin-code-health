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
import { Route, Routes } from "react-router-dom";
import { IngestionResetButton } from "../presentation/components/ingestion_reset_button";
import { ThemeToggleButton } from "../presentation/components/theme_toggle_button";
import { useCapabilities } from "../presentation/hooks/use_capabilities";
import { useCoverage } from "../presentation/hooks/use_coverage";
import { ContributorDetailPage } from "../presentation/pages/contributor_detail_page";
import { ContributorsPage } from "../presentation/pages/contributors_page";
import { DashboardPage } from "../presentation/pages/dashboard_page";
import { IdentitiesPage } from "../presentation/pages/identities_page";
import { InsightsPage } from "../presentation/pages/insights_page";
import { RepositoryDetailPage } from "../presentation/pages/repository_detail_page";
import {
  codeHealthAdministrationApiRef,
  codeHealthConfigApiRef,
  codeHealthContributorsApiRef,
  codeHealthCoverageApiRef,
  codeHealthIdentitiesApiRef,
  codeHealthIntegrationsApiRef,
  codeHealthOwnershipApiRef,
  codeHealthRepositoriesApiRef,
  codeHealthTimeSeriesApiRef,
  codeHealthTrendsApiRef,
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
 *
 * Identities sits last because it is maintenance rather than a measurement:
 * somebody goes there once after installation and then only when a new account
 * turns up. What it decides, though, shapes every other tab — a contributor row
 * is a person, and it is where a person is defined.
 *
 * The Contributors and Repositories tabs each hold a detail page beneath their
 * table. `TabbedLayout` matches every tab as `<path>/*`, so the nested routes
 * below resolve relative to the tab and the tab stays selected while a person
 * or a repository is open.
 */
export const Router = () => {
  const config = useApi(codeHealthConfigApiRef);
  const dashboardService = useApi(codeHealthRepositoriesApiRef);
  const contributorService = useApi(codeHealthContributorsApiRef);
  const coverageService = useApi(codeHealthCoverageApiRef);
  const timeSeriesService = useApi(codeHealthTimeSeriesApiRef);
  const integrationsService = useApi(codeHealthIntegrationsApiRef);
  const identityService = useApi(codeHealthIdentitiesApiRef);
  const trendService = useApi(codeHealthTrendsApiRef);
  const ownershipService = useApi(codeHealthOwnershipApiRef);
  const administrationService = useApi(codeHealthAdministrationApiRef);
  const coverage = useCoverage(coverageService);
  // Asked once, alongside the reachability probe, so no view has to decide for
  // itself whether an empty column means "off" or "not collected yet".
  const { capabilities } = useCapabilities(integrationsService);

  return (
    <Page themeId="tool">
      <Header title="Code Health" subtitle="Repository health across your catalog">
        <IngestionResetButton
          administrationService={administrationService}
          onReset={coverage.reload}
        />
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
                capabilities={capabilities}
              />
            </TabBody>
          </TabbedLayout.Route>

          <TabbedLayout.Route path="/contributors" title="Contributors">
            <TabBody error={coverage.error}>
              <Routes>
                <Route
                  path="/person"
                  element={
                    <ContributorDetailPage
                      trendService={trendService}
                      ownershipService={ownershipService}
                      coverage={coverage}
                      capabilities={capabilities}
                    />
                  }
                />
                <Route
                  path="/*"
                  element={
                    <ContributorsPage
                      contributorService={contributorService}
                      dashboardService={dashboardService}
                      coverage={coverage}
                      config={config}
                      capabilities={capabilities}
                    />
                  }
                />
              </Routes>
            </TabBody>
          </TabbedLayout.Route>

          <TabbedLayout.Route path="/repositories" title="Repositories">
            <TabBody error={coverage.error}>
              <Routes>
                <Route
                  path="/:id"
                  element={
                    <RepositoryDetailPage
                      trendService={trendService}
                      contributorService={contributorService}
                      coverage={coverage}
                      capabilities={capabilities}
                    />
                  }
                />
                <Route
                  path="/*"
                  element={
                    <DashboardPage
                      dashboardService={dashboardService}
                      coverage={coverage}
                      config={config}
                      capabilities={capabilities}
                    />
                  }
                />
              </Routes>
            </TabBody>
          </TabbedLayout.Route>

          <TabbedLayout.Route path="/identities" title="Identities">
            <TabBody error={coverage.error}>
              <IdentitiesPage
                identityService={identityService}
                capabilities={capabilities}
              />
            </TabBody>
          </TabbedLayout.Route>
        </TabbedLayout>
      )}
    </Page>
  );
};
