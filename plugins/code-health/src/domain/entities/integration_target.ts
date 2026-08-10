import type { Platform } from "@rios0rios0/backstage-plugin-code-health-common";

/** Every external system the dashboard talks to. */
export type IntegrationTarget = Platform | "sonar" | "wakatime";

export const INTEGRATION_TARGETS: readonly IntegrationTarget[] = [
  "github",
  "azure-devops",
  "sonar",
  "wakatime",
];
