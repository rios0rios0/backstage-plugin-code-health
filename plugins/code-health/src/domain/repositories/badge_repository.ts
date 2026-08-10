import type { BadgeStatus } from "@rios0rios0/backstage-plugin-code-health-common";

export interface BadgeRepository {
  getBadgeStatus(
    token: string,
    owner: string,
    repoName: string,
  ): Promise<BadgeStatus | null>;
}
