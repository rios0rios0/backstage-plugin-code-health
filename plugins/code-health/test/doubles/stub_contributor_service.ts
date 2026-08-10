import type {
  ContributorSummary,
  TimeWindow,
} from "@rios0rios0/backstage-plugin-code-health-common";
import type { ContributorService } from "../../src/domain/services/dashboard_service";

export class StubContributorService implements ContributorService {
  private result: ContributorSummary[] = [];
  private error: Error | null = null;

  /** Windows each call was made with, so a range change is observable. */
  readonly calls: Array<{ window: TimeWindow; repositoryId?: string }> = [];

  withContributors(contributors: ContributorSummary[]): this {
    this.result = contributors;
    return this;
  }

  withError(error: Error): this {
    this.error = error;
    return this;
  }

  async listContributors(
    window: TimeWindow,
    repositoryId?: string,
  ): Promise<ContributorSummary[]> {
    this.calls.push({ window, ...(repositoryId === undefined ? {} : { repositoryId }) });
    if (this.error) throw this.error;
    return this.result;
  }
}
