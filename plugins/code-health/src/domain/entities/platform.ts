export type Platform = "github" | "azure-devops";

export const isPlatform = (value: string | null | undefined): value is Platform =>
  value === "github" || value === "azure-devops";
