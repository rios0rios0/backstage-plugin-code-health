import type {
  GetContributorTrendResponse,
  GetRepositoryTrendResponse,
  TimeSeriesBucket,
  TimeWindow,
} from "@rios0rios0/backstage-plugin-code-health-common";
import type { TrendService } from "../../src/domain/services/dashboard_service";

const WINDOW: TimeWindow = { from: "2026-06-09T00:00:00.000Z", to: "2026-09-09T00:00:00.000Z" };

export const aContributorTrend = (
  overrides: Partial<GetContributorTrendResponse> = {},
): GetContributorTrendResponse => ({
  key: "vcs:jane",
  window: WINDOW,
  bucket: "week",
  summary: null,
  score: null,
  points: [],
  ...overrides,
});

export class StubTrendService implements TrendService {
  private contributorResult: GetContributorTrendResponse = aContributorTrend();
  private repositoryResult: GetRepositoryTrendResponse | null = null;
  private error: Error | null = null;

  /** What each call asked for, so a month change is observable. */
  readonly contributorCalls: Array<{ key: string; window: TimeWindow; bucket: TimeSeriesBucket }> = [];
  readonly repositoryCalls: Array<{ id: string; window: TimeWindow; bucket: TimeSeriesBucket }> = [];

  withContributorTrend(result: GetContributorTrendResponse): this {
    this.contributorResult = result;
    return this;
  }

  withRepositoryTrend(result: GetRepositoryTrendResponse): this {
    this.repositoryResult = result;
    return this;
  }

  withError(error: Error): this {
    this.error = error;
    return this;
  }

  async getContributorTrend(
    key: string,
    window: TimeWindow,
    bucket: TimeSeriesBucket,
  ): Promise<GetContributorTrendResponse> {
    this.contributorCalls.push({ key, window, bucket });
    if (this.error) throw this.error;
    return { ...this.contributorResult, key, window, bucket };
  }

  async getRepositoryTrend(
    id: string,
    window: TimeWindow,
    bucket: TimeSeriesBucket,
  ): Promise<GetRepositoryTrendResponse> {
    this.repositoryCalls.push({ id, window, bucket });
    if (this.error) throw this.error;
    if (this.repositoryResult === null) throw new Error(`no repository with id ${id}`);
    return { ...this.repositoryResult, id, window, bucket };
  }
}
