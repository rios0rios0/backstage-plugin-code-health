import type { BadgeStatus } from "@rios0rios0/backstage-plugin-code-health-common";
import type { BadgeRepository } from "../../domain/repositories/badge_repository";

export class AdoBadgeRepository implements BadgeRepository {
  async getBadgeStatus(
    _token: string,
    _owner: string,
    _repoName: string,
  ): Promise<BadgeStatus | null> {
    return null;
  }
}
