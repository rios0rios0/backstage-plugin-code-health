export type SonarType = "cloud" | "qube";

export const SONARCLOUD_BASE_URL = "https://sonarcloud.io";

export const isSonarType = (value: string | null): value is SonarType =>
  value === "cloud" || value === "qube";
