export type QualityGateStatus = "OK" | "ERROR" | "NONE";

export interface SonarMetrics {
  readonly bugs: number;
  readonly codeSmells: number;
  readonly securityHotspots: number;
  readonly vulnerabilities: number;
  readonly coverage: number;
  readonly duplications: number;
  /** Formatted for display, e.g. `2d 3h`. */
  readonly technicalDebt: string;
  /**
   * The same value in minutes, as SonarQube's `sqale_index` reports it.
   *
   * Kept alongside the formatted string because the formatting is lossy — it
   * drops the residual minutes once there are whole days — so anything that has
   * to add two debts together cannot work backwards from `technicalDebt`.
   */
  readonly technicalDebtMinutes: number;
  readonly qualityGateStatus: QualityGateStatus;
}

/**
 * Sonar reports technical debt as a minute count; the dashboard shows a
 * duration. Lives here rather than beside the collector because the contributor
 * aggregation formats a summed debt with the same rules, and two copies would
 * drift.
 */
export const formatDebt = (minutes: number): string => {
  if (minutes <= 0) return "0min";
  const days = Math.floor(minutes / (60 * 8));
  const hours = Math.floor((minutes % (60 * 8)) / 60);
  const remainder = minutes % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0)
    return remainder > 0 ? `${hours}h ${remainder}min` : `${hours}h`;
  return `${remainder}min`;
};
