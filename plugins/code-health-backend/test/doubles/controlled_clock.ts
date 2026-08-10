import type { GatewayClock } from "../../src/infrastructure/http/provider_gateway";

/**
 * A clock the test drives.
 *
 * Sleeping advances the clock instead of waiting, so backoff and pacing
 * behaviour can be asserted exactly — including the multi-second waits a
 * provider asks for — without the suite taking that long to run.
 */
export class ControlledClock implements GatewayClock {
  private current: number;

  /** Every sleep duration requested, in order. */
  readonly sleeps: number[] = [];

  constructor(startAt = 0) {
    this.current = startAt;
  }

  now(): number {
    return this.current;
  }

  async sleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw new Error("aborted");
    this.sleeps.push(milliseconds);
    this.current += milliseconds;
  }

  advance(milliseconds: number): void {
    this.current += milliseconds;
  }

  /** Total time spent sleeping, which is what pacing actually costs a run. */
  get totalSlept(): number {
    return this.sleeps.reduce((total, value) => total + value, 0);
  }
}
