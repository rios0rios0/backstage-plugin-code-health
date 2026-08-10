import type { BadgeStatus } from "../../src/domain/entities/badge_status";
import type { BadgeRepository } from "../../src/domain/repositories/badge_repository";

export class StubBadgeRepository implements BadgeRepository {
  private results = new Map<string, BadgeStatus | null>();
  private error: Error | null = null;

  withBadgeStatus(repoName: string, status: BadgeStatus | null): this {
    this.results.set(repoName, status);
    return this;
  }

  withError(error: Error): this {
    this.error = error;
    return this;
  }

  async getBadgeStatus(
    _token: string,
    _owner: string,
    repoName: string,
  ): Promise<BadgeStatus | null> {
    if (this.error) throw this.error;
    return this.results.get(repoName) ?? null;
  }
}
