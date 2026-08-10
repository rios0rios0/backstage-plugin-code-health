import type { BadgeStatus } from "../entities/badge_status";

export interface BadgeRepository {
  getBadgeStatus(
    token: string,
    owner: string,
    repoName: string,
  ): Promise<BadgeStatus | null>;
}
