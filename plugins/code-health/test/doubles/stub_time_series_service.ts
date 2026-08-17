import type {
  TimeSeriesBucket,
  TimeSeriesPoint,
  TimeWindow,
} from "@rios0rios0/backstage-plugin-code-health-common";
import type { TimeSeriesService } from "../../src/domain/services/dashboard_service";

export class StubTimeSeriesService implements TimeSeriesService {
  private result: TimeSeriesPoint[] = [];
  private error: Error | null = null;

  callCount = 0;
  /** Buckets each call asked for, so the derived bucket is observable. */
  readonly buckets: TimeSeriesBucket[] = [];
  readonly windows: TimeWindow[] = [];

  withPoints(points: TimeSeriesPoint[]): this {
    this.result = points;
    return this;
  }

  withError(error: Error): this {
    this.error = error;
    return this;
  }

  async getTimeSeries(
    window: TimeWindow,
    bucket: TimeSeriesBucket,
  ): Promise<TimeSeriesPoint[]> {
    this.callCount += 1;
    this.windows.push(window);
    this.buckets.push(bucket);
    if (this.error) throw this.error;
    return this.result;
  }
}
