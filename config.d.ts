/**
 * Configuration schema for the GitForge Dashboard Backstage plugin.
 *
 * Every value declared here is safe to expose to the browser. Credentials are
 * deliberately absent: tokens either live in the Backstage `proxy` endpoint
 * configuration (backend side, never shipped to the frontend) or are supplied
 * by each user through the plugin's Settings page and kept encrypted in their
 * own browser.
 */
export interface Config {
  gitforgeDashboard?: {
    /**
     * Version control platform the dashboard reads from.
     *
     * @visibility frontend
     */
    platform?: 'github' | 'azure-devops';

    /**
     * GitHub username or Azure DevOps organization whose repositories are shown.
     *
     * @visibility frontend
     */
    organization?: string;

    /**
     * Auto-refresh interval in milliseconds. Accepted values are 60000, 300000,
     * 900000 and 0 (disabled). Defaults to 300000.
     *
     * @visibility frontend
     */
    refreshIntervalMs?: number;

    github?: {
      /**
       * GitHub GraphQL endpoint. Defaults to `https://api.github.com/graphql`.
       *
       * @visibility frontend
       */
      baseUrl?: string;

      /**
       * Path of a Backstage `proxy` endpoint that fronts the GitHub GraphQL API,
       * for example `/gitforge-github`. When set, requests are routed through the
       * Backstage backend and the browser never handles a GitHub token.
       *
       * @visibility frontend
       */
      proxyPath?: string;
    };

    azureDevOps?: {
      /**
       * Azure DevOps REST base URL. Defaults to `https://dev.azure.com`.
       *
       * @visibility frontend
       */
      baseUrl?: string;

      /**
       * Path of a Backstage `proxy` endpoint that fronts the Azure DevOps REST API.
       *
       * @visibility frontend
       */
      proxyPath?: string;
    };

    sonar?: {
      /**
       * Whether the instance is SonarCloud (`cloud`) or a self-hosted SonarQube (`qube`).
       *
       * @visibility frontend
       */
      type?: 'cloud' | 'qube';

      /**
       * Sonar base URL. Defaults to `https://sonarcloud.io` for `cloud`.
       *
       * @visibility frontend
       */
      baseUrl?: string;

      /**
       * SonarCloud organization key. Defaults to `gitforgeDashboard.organization`.
       *
       * @visibility frontend
       */
      organization?: string;

      /**
       * Path of a Backstage `proxy` endpoint that fronts the Sonar Web API.
       *
       * @visibility frontend
       */
      proxyPath?: string;
    };

    wakaTime?: {
      /**
       * WakaTime API base URL. Defaults to `https://wakatime.com/api/v1`.
       *
       * @visibility frontend
       */
      baseUrl?: string;

      /**
       * Path of a Backstage `proxy` endpoint that fronts the WakaTime API.
       *
       * @visibility frontend
       */
      proxyPath?: string;
    };
  };
}
