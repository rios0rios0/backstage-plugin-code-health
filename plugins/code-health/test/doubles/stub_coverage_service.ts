import type {
  BackfillProgress,
  CoverageInfo,
} from "@rios0rios0/backstage-plugin-code-health-common";
import { EMPTY_BACKFILL_PROGRESS } from "@rios0rios0/backstage-plugin-code-health-common";
import type { CoverageService } from "../../src/domain/services/dashboard_service";

export const aCoverageInfo = (
  overrides: Omit<Partial<CoverageInfo>, "backfill"> & {
    backfill?: Partial<BackfillProgress>;
  } = {},
): CoverageInfo => ({
  earliestDay: "2025-08-10",
  latestDay: "2026-08-09",
  lastIngestedAt: "2026-08-10T11:55:00.000Z",
  freshUntil: "2026-08-10T11:55:00.000Z",
  ...overrides,
  backfill: {
    ...EMPTY_BACKFILL_PROGRESS,
    repositories: 3,
    complete: 3,
    ingestedDays: 1095,
    percent: 100,
    ...overrides.backfill,
  },
});

export class StubCoverageService implements CoverageService {
  private result: CoverageInfo = aCoverageInfo();
  private error: Error | null = null;

  refreshCount = 0;

  withCoverage(coverage: CoverageInfo): this {
    this.result = coverage;
    return this;
  }

  withError(error: Error): this {
    this.error = error;
    return this;
  }

  async getCoverage(): Promise<CoverageInfo> {
    if (this.error) throw this.error;
    return this.result;
  }

  async refresh(): Promise<void> {
    this.refreshCount += 1;
  }
}
