/** Version control platforms the plugin can ingest from. */
export type Platform = "github" | "azure-devops";

export const PLATFORMS: readonly Platform[] = ["github", "azure-devops"];

export const isPlatform = (value: string | null | undefined): value is Platform =>
  value === "github" || value === "azure-devops";
