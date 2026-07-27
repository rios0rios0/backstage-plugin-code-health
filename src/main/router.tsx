import {
  Content,
  Header,
  HeaderLabel,
  Page,
  Progress,
  TabbedLayout,
} from "@backstage/core-components";
import { useApi } from "@backstage/core-plugin-api";
import { AuthGate } from "../presentation/components/auth_gate";
import { ThemeToggleButton } from "../presentation/components/theme_toggle_button";
import { useAuthentication } from "../presentation/hooks/use_authentication";
import { ContributorsPage } from "../presentation/pages/contributors_page";
import { DashboardPage } from "../presentation/pages/dashboard_page";
import { SettingsPage } from "../presentation/pages/settings_page";
import {
  gitforgeAuthApiRef,
  gitforgeConfigApiRef,
  gitforgeContributorsApiRef,
  gitforgeDashboardApiRef,
} from "./api_refs";

const PLATFORM_LABELS = {
  github: "GitHub",
  "azure-devops": "Azure DevOps",
} as const;

/**
 * Routable entry point of the plugin. It wires the Backstage utility APIs into
 * the presentation layer and hosts the three tabs of the dashboard.
 */
export const Router = () => {
  const authApi = useApi(gitforgeAuthApiRef);
  const config = useApi(gitforgeConfigApiRef);
  const dashboardService = useApi(gitforgeDashboardApiRef);
  const contributorService = useApi(gitforgeContributorsApiRef);
  const auth = useAuthentication(authApi, config);

  if (!auth.isReady) {
    return (
      <Page themeId="tool">
        <Header title="GitForge Dashboard" />
        <Content>
          <Progress />
        </Content>
      </Page>
    );
  }

  if (!auth.isConfigured) {
    return (
      <Page themeId="tool">
        <Header title="GitForge Dashboard" subtitle="Not configured yet">
          <ThemeToggleButton />
        </Header>
        <Content>
          <AuthGate onLogin={auth.login} error={null} />
        </Content>
      </Page>
    );
  }

  const platform = auth.effectivePlatform ?? "github";

  return (
    <Page themeId="tool">
      <Header title="GitForge Dashboard" subtitle={auth.effectiveOrganization ?? undefined}>
        <HeaderLabel label="Platform" value={PLATFORM_LABELS[platform]} />
        <ThemeToggleButton />
      </Header>

      <TabbedLayout>
        <TabbedLayout.Route path="/" title="Repositories">
          <DashboardPage dashboardService={dashboardService} />
        </TabbedLayout.Route>

        <TabbedLayout.Route path="/contributors" title="Contributors">
          <ContributorsPage contributorService={contributorService} />
        </TabbedLayout.Route>

        <TabbedLayout.Route path="/settings" title="Settings">
          <SettingsPage
            token={auth.token ?? ""}
            username={auth.effectiveOrganization ?? ""}
            platform={platform}
            sonarToken={auth.sonarToken}
            sonarType={auth.sonarType}
            sonarUrl={auth.sonarUrl}
            wakaTimeToken={auth.wakaTimeToken}
            config={config}
            onUpdateVcs={auth.updateVcsCredentials}
            onUpdateSonar={auth.updateSonarConfig}
            onUpdateWakaTime={auth.updateWakaTimeToken}
            onForgetCredentials={auth.logout}
          />
        </TabbedLayout.Route>
      </TabbedLayout>
    </Page>
  );
};
