import type { Platform } from "./platform";

/** Every external system the dashboard talks to. */
export type IntegrationTarget = Platform | "sonar" | "wakatime";

export const INTEGRATION_TARGETS: readonly IntegrationTarget[] = [
  "github",
  "azure-devops",
  "sonar",
  "wakatime",
];
