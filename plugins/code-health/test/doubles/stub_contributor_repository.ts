import type { Contributor } from "../../src/domain/entities/contributor";
import type { ContributorRepository } from "../../src/domain/repositories/contributor_repository";

export class StubContributorRepository implements ContributorRepository {
  private result: Contributor[] = [];
  private error: Error | null = null;

  withContributors(contributors: Contributor[]): this {
    this.result = contributors;
    return this;
  }

  withError(error: Error): this {
    this.error = error;
    return this;
  }

  async listContributors(
    _token: string,
    _username: string,
    _dateFrom: string | null,
    _dateTo: string | null,
  ): Promise<Contributor[]> {
    if (this.error) throw this.error;
    return this.result;
  }
}
