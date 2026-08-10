import type { BadgeStatus } from "../../domain/entities/badge_status";
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
