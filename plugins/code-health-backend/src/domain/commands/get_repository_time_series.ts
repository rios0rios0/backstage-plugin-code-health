import type {
  TimeSeriesBucket,
  TimeSeriesPoint,
} from "@rios0rios0/backstage-plugin-code-health-common";
import { aggregateActivity } from "../entities/activity";
import { bucketStart, bucketsInWindow } from "../entities/bucket";
import type { CodeHealthEvent } from "../entities/code_health_event";
import { toDay, type Day } from "../entities/day";
import type { CodeHealthStore } from "../repositories/code_health_store";

export class GetRepositoryTimeSeries {
  constructor(private readonly store: CodeHealthStore) {}

  /**
   * Aggregates activity into buckets — one repository's, or the whole fleet's
   * when no repository is named.
   *
   * Buckets with no events are still emitted, so a chart shows a gap as a zero
   * rather than closing over it and implying activity that never happened.
   */
  async run(input: {
    /** Omit to aggregate every tracked repository into one series. */
    repositoryId?: string;
    from: Date;
    to: Date;
    bucket: TimeSeriesBucket;
  }): Promise<TimeSeriesPoint[]> {
    const events = await this.store.listEvents({
      from: input.from,
      to: input.to,
      ...(input.repositoryId === undefined ? {} : { repositoryIds: [input.repositoryId] }),
    });

    const byBucket = new Map<Day, CodeHealthEvent[]>(
      bucketsInWindow(input.from, input.to, input.bucket).map((day) => [day, []]),
    );

    for (const event of events) {
      const key = bucketStart(toDay(event.occurredAt), input.bucket);
      const bucket = byBucket.get(key);
      if (bucket) bucket.push(event);
      else byBucket.set(key, [event]);
    }

    return [...byBucket.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([day, bucketEvents]) => ({ day, activity: aggregateActivity(bucketEvents) }));
  }
}
