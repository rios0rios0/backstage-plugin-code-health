import type { QualityGateStatus, SonarMetrics } from "@rios0rios0/backstage-plugin-code-health-common";
import type { SonarType } from "../../domain/entities/sonar_type";
import type { AuthorIssues, SonarRepository } from "../../domain/repositories/sonar_repository";
import type { SonarClient } from "../http/sonar_client";

export interface SonarConfig {
  type: SonarType;
  token: string;
  baseUrl: string;
  organization?: string;
}

interface SonarMeasure {
  metric: string;
  value: string;
}

interface SonarMeasuresResponse {
  component: { measures: SonarMeasure[] };
}

interface SonarProjectSearchResponse {
  components: { key: string }[];
  paging: { total: number };
}

interface SonarQualityGateResponse {
  projectStatus: { status: string };
}

interface SonarIssue {
  author: string;
  type: "BUG" | "CODE_SMELL" | "VULNERABILITY" | "SECURITY_HOTSPOT";
}

interface SonarIssuesResponse {
  issues: SonarIssue[];
  paging: { total: number; pageIndex: number; pageSize: number };
}

const QUALITY_GATE_STATUSES: Record<string, QualityGateStatus> = {
  OK: "OK",
  ERROR: "ERROR",
};

const METRIC_KEYS = [
  "bugs",
  "code_smells",
  "security_hotspots",
  "vulnerabilities",
  "coverage",
  "duplicated_lines_density",
  "sqale_index",
].join(",");

const parseMeasures = (measures: SonarMeasure[], qualityGate: QualityGateStatus): SonarMetrics => {
  const get = (key: string): string => measures.find((m) => m.metric === key)?.value ?? "0";

  const sqaleMinutes = parseInt(get("sqale_index"), 10);
  const days = Math.floor(sqaleMinutes / (8 * 60));
  const hours = Math.floor((sqaleMinutes % (8 * 60)) / 60);
  const mins = sqaleMinutes % 60;
  const debtParts: string[] = [];
  if (days > 0) debtParts.push(`${days}d`);
  if (hours > 0) debtParts.push(`${hours}h`);
  debtParts.push(`${mins}min`);

  return {
    bugs: parseInt(get("bugs"), 10),
    codeSmells: parseInt(get("code_smells"), 10),
    securityHotspots: parseInt(get("security_hotspots"), 10),
    vulnerabilities: parseInt(get("vulnerabilities"), 10),
    coverage: parseFloat(get("coverage")),
    duplications: parseFloat(get("duplicated_lines_density")),
    technicalDebt: debtParts.join(" "),
    qualityGateStatus: qualityGate,
  };
};

export class SonarRepositoryImpl implements SonarRepository {
  private readonly client: SonarClient;
  private readonly config: SonarConfig;

  constructor(client: SonarClient, config: SonarConfig) {
    this.client = client;
    this.config = config;
  }

  private request<T>(path: string): Promise<T> {
    return this.client.get<T>(this.config.token, this.config.baseUrl, path);
  }

  async listProjectKeys(): Promise<string[]> {
    try {
      const orgParam =
        this.config.type === "cloud" && this.config.organization
          ? `&organization=${encodeURIComponent(this.config.organization)}`
          : "";
      const data = await this.request<SonarProjectSearchResponse>(
        `/api/projects/search?ps=500${orgParam}`,
      );
      return data.components.map((c) => c.key);
    } catch {
      return [];
    }
  }

  async getProjectMetrics(projectKey: string): Promise<SonarMetrics | null> {
    try {
      const [measuresData, gateData] = await Promise.all([
        this.request<SonarMeasuresResponse>(
          `/api/measures/component?component=${encodeURIComponent(projectKey)}&metricKeys=${METRIC_KEYS}`,
        ),
        this.request<SonarQualityGateResponse>(
          `/api/qualitygates/project_status?projectKey=${encodeURIComponent(projectKey)}`,
        ).catch(() => null),
      ]);

      const gateStatus = gateData?.projectStatus?.status ?? "";
      const qualityGate = QUALITY_GATE_STATUSES[gateStatus] ?? "NONE";

      return parseMeasures(measuresData.component.measures, qualityGate);
    } catch {
      return null;
    }
  }

  async getIssuesByAuthor(projectKey: string): Promise<Map<string, AuthorIssues>> {
    const result = new Map<string, AuthorIssues>();
    let page = 1;
    const pageSize = 500;

    try {
      for (;;) {
        const data = await this.request<SonarIssuesResponse>(
          `/api/issues/search?componentKeys=${encodeURIComponent(projectKey)}&statuses=OPEN,CONFIRMED&ps=${pageSize}&p=${page}`,
        );

        for (const issue of data.issues) {
          const author = issue.author || "unknown";
          let entry = result.get(author);
          if (!entry) {
            entry = { bugs: 0, codeSmells: 0, vulnerabilities: 0, securityHotspots: 0 };
            result.set(author, entry);
          }

          const typeHandlers: Record<string, () => void> = {
            BUG: () => entry.bugs++,
            CODE_SMELL: () => entry.codeSmells++,
            VULNERABILITY: () => entry.vulnerabilities++,
            SECURITY_HOTSPOT: () => entry.securityHotspots++,
          };
          typeHandlers[issue.type]?.();
        }

        if (page * pageSize >= data.paging.total) break;
        page++;
      }
    } catch {
      // return whatever we collected
    }

    return result;
  }
}

export class NoOpSonarRepository implements SonarRepository {
  async listProjectKeys(): Promise<string[]> {
    return [];
  }

  async getProjectMetrics(_projectKey: string): Promise<SonarMetrics | null> {
    return null;
  }

  async getIssuesByAuthor(_projectKey: string): Promise<Map<string, AuthorIssues>> {
    return new Map();
  }
}
