import type { Repository } from "../entities/repository";

/**
 * Contract consumed by the presentation layer. Credentials and the target
 * organization are resolved internally from app-config and user settings.
 */
export interface DashboardService {
  listRepositories(): Promise<Repository[]>;
}

/** Contract implemented by the platform specific services (GitHub, Azure DevOps). */
export interface PlatformDashboardService {
  listRepositories(token: string, username: string): Promise<Repository[]>;
}
