import type { Contributor } from "../entities/contributor";

export interface ContributorRepository {
  listContributors(
    token: string,
    username: string,
    dateFrom: string | null,
    dateTo: string | null,
  ): Promise<Contributor[]>;
}
