export type QualityGateStatus = "OK" | "ERROR" | "NONE";

export interface SonarMetrics {
  readonly bugs: number;
  readonly codeSmells: number;
  readonly securityHotspots: number;
  readonly vulnerabilities: number;
  readonly coverage: number;
  readonly duplications: number;
  readonly technicalDebt: string;
  readonly qualityGateStatus: QualityGateStatus;
}
