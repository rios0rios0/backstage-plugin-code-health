import type {
  RepositorySummary,
  TimeWindow,
} from "@rios0rios0/backstage-plugin-code-health-common";
import type { DashboardService } from "../../src/domain/services/dashboard_service";

export class StubDashboardService implements DashboardService {
  private result: RepositorySummary[] = [];
  private error: Error | null = null;

  callCount = 0;
  /** Windows each call was made with, so a range change is observable. */
  readonly windows: TimeWindow[] = [];

  withRepositories(repositories: RepositorySummary[]): this {
    this.result = repositories;
    return this;
  }

  withError(error: Error): this {
    this.error = error;
    return this;
  }

  async listRepositories(window: TimeWindow): Promise<RepositorySummary[]> {
    this.callCount += 1;
    this.windows.push(window);
    if (this.error) throw this.error;
    return this.result;
  }
}
