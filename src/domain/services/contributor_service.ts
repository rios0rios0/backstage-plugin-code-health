import type { Contributor } from "../entities/contributor";

/**
 * Contract consumed by the presentation layer. Credentials and the target
 * organization are resolved internally from app-config and user settings.
 */
export interface ContributorService {
  listContributors(dateFrom: string | null, dateTo: string | null): Promise<Contributor[]>;
}

/** Contract implemented by the platform specific services (GitHub, Azure DevOps). */
export interface PlatformContributorService {
  listContributors(
    token: string,
    username: string,
    dateFrom: string | null,
    dateTo: string | null,
  ): Promise<Contributor[]>;
}
