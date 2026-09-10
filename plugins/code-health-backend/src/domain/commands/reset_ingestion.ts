import type { LoggerService } from "@backstage/backend-plugin-api";
import type { CodeHealthStore } from "../repositories/code_health_store";

export interface ResetIngestionOptions {
  readonly store: CodeHealthStore;
  readonly logger?: LoggerService;
}

export class ResetIngestion {
  constructor(private readonly options: ResetIngestionOptions) {}

  /**
   * Sends every tracked repository's history collection back to the start.
   *
   * This is the same thing the merged-work migration did once, with the reach
   * chosen by whoever asked instead of by the retention setting. It exists as a
   * route because the reasons keep recurring: an attribution rule changes, a
   * provider backfills something it had been hiding, a repository is
   * re-annotated and its history is now attributed to the wrong people. None of
   * those can be repaired in place, because the facts a re-walk needs were
   * never stored.
   *
   * What it costs is visible and it is paid deliberately: the dashboard behaves
   * as it does after installation — the last day answerable from the first run,
   * wider ranges unlocking as the backfill advances — and the walk itself is
   * hours of rate-limited requests across a large fleet. That is why the reach
   * is asked for rather than assumed.
   *
   * Snapshots, releases and tags are kept. They come from the daily snapshot
   * rather than from the walk, so deleting them would lose history nothing
   * would ever put back.
   */
  async run(input: { days: number; now: Date }): Promise<{ repositories: number }> {
    const result = await this.options.store.resetIngestion(input);

    this.options.logger?.info(
      `history collection reset for ${result.repositories} repositories, reaching ${input.days} days back`,
    );

    return result;
  }
}
