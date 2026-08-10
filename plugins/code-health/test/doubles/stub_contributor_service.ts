import type { Contributor } from "../../src/domain/entities/contributor";
import type { ContributorService } from "../../src/domain/services/contributor_service";

export class StubContributorService implements ContributorService {
  private result: Contributor[] = [];
  private error: Error | null = null;
  readonly calls: { dateFrom: string | null; dateTo: string | null }[] = [];

  withContributors(contributors: Contributor[]): this {
    this.result = contributors;
    return this;
  }

  withError(error: Error): this {
    this.error = error;
    return this;
  }

  async listContributors(
    dateFrom: string | null,
    dateTo: string | null,
  ): Promise<Contributor[]> {
    this.calls.push({ dateFrom, dateTo });
    if (this.error) throw this.error;
    return this.result;
  }
}
