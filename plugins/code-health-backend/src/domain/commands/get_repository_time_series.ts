import type {
  TimeSeriesBucket,
  TimeSeriesPoint,
} from "@rios0rios0/backstage-plugin-code-health-common";
import { aggregateActivity } from "../entities/activity";
import type { CodeHealthEvent } from "../entities/code_health_event";
import { addDays, daysInRange, toDay, type Day } from "../entities/day";
import type { CodeHealthStore } from "../repositories/code_health_store";

/**
 * The first day of the bucket an instant belongs to.
 *
 * Weeks start on Monday, which is the convention every calendar the dashboard
 * sits beside uses; months start on the first.
 */
const bucketStart = (day: Day, bucket: TimeSeriesBucket): Day => {
  if (bucket === "day") return day;
  if (bucket === "month") return `${day.slice(0, 7)}-01`;

  const date = new Date(`${day}T00:00:00.000Z`);
  // `getUTCDay` returns 0 for Sunday, which belongs to the week that started
  // six days earlier rather than to the one starting the next morning.
  const weekday = date.getUTCDay();
  return addDays(day, -(weekday === 0 ? 6 : weekday - 1));
};

export class GetRepositoryTimeSeries {
  constructor(private readonly store: CodeHealthStore) {}

  /**
   * Aggregates one repository's activity into buckets.
   *
   * Buckets with no events are still emitted, so a chart shows a gap as a zero
   * rather than closing over it and implying activity that never happened.
   */
  async run(input: {
    repositoryId: string;
    from: Date;
    to: Date;
    bucket: TimeSeriesBucket;
  }): Promise<TimeSeriesPoint[]> {
    const events = await this.store.listEvents({
      from: input.from,
      to: input.to,
      repositoryIds: [input.repositoryId],
    });

    const byBucket = new Map<Day, CodeHealthEvent[]>();
    for (const day of daysInRange(toDay(input.from), toDay(new Date(input.to.getTime() - 1)))) {
      byBucket.set(bucketStart(day, input.bucket), []);
    }

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
