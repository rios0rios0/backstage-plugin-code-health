import type { Contributor } from "../domain/entities/contributor";
import type { SonarMetrics } from "../domain/entities/sonar_metrics";
import type { ContributorRepository } from "../domain/repositories/contributor_repository";
import type { AuthorIssues, SonarRepository } from "../domain/repositories/sonar_repository";
import type { WakaTimeRepository } from "../domain/repositories/wakatime_repository";
import type { PlatformContributorService } from "../domain/services/contributor_service";

const aggregateProjectMetrics = (
  metricsArray: (SonarMetrics | null)[],
): SonarMetrics | null => {
  const valid = metricsArray.filter((m): m is SonarMetrics => m !== null);
  if (valid.length === 0) return null;

  return {
    bugs: valid.reduce((sum, m) => sum + m.bugs, 0),
    codeSmells: valid.reduce((sum, m) => sum + m.codeSmells, 0),
    securityHotspots: valid.reduce((sum, m) => sum + m.securityHotspots, 0),
    vulnerabilities: valid.reduce((sum, m) => sum + m.vulnerabilities, 0),
    coverage: valid.reduce((sum, m) => sum + m.coverage, 0) / valid.length,
    duplications: valid.reduce((sum, m) => sum + m.duplications, 0) / valid.length,
    technicalDebt: formatTotalDebt(valid),
    qualityGateStatus: "NONE",
  };
};

const formatTotalDebt = (metrics: SonarMetrics[]): string => {
  let totalMinutes = 0;
  for (const m of metrics) {
    totalMinutes += parseDebtToMinutes(m.technicalDebt);
  }
  return formatMinutesToDebt(totalMinutes);
};

const parseDebtToMinutes = (debt: string): number => {
  let minutes = 0;
  const dayMatch = debt.match(/(\d+)d/);
  const hourMatch = debt.match(/(\d+)h/);
  const minMatch = debt.match(/(\d+)min/);
  if (dayMatch) minutes += parseInt(dayMatch[1], 10) * 8 * 60;
  if (hourMatch) minutes += parseInt(hourMatch[1], 10) * 60;
  if (minMatch) minutes += parseInt(minMatch[1], 10);
  return minutes;
};

const formatMinutesToDebt = (totalMinutes: number): string => {
  const days = Math.floor(totalMinutes / (8 * 60));
  const hours = Math.floor((totalMinutes % (8 * 60)) / 60);
  const mins = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${mins}min`);
  return parts.join(" ");
};

const mergeAuthorIssues = (
  allIssues: Map<string, AuthorIssues>[],
): Map<string, AuthorIssues> => {
  const merged = new Map<string, AuthorIssues>();
  for (const projectIssues of allIssues) {
    for (const [author, issues] of projectIssues) {
      const existing = merged.get(author);
      if (existing) {
        existing.bugs += issues.bugs;
        existing.codeSmells += issues.codeSmells;
        existing.vulnerabilities += issues.vulnerabilities;
        existing.securityHotspots += issues.securityHotspots;
      } else {
        merged.set(author, { ...issues });
      }
    }
  }
  return merged;
};

const matchContributorToAuthor = (
  contributorName: string,
  authorKeys: string[],
): string | null => {
  const lower = contributorName.toLowerCase();
  return authorKeys.find((author) => {
    const authorLower = author.toLowerCase();
    return authorLower.includes(lower) || lower.includes(authorLower);
  }) ?? null;
};

export class GitHubContributorService implements PlatformContributorService {
  private readonly contributorRepository: ContributorRepository;
  private readonly sonarRepository: SonarRepository;
  private readonly wakaTimeRepository: WakaTimeRepository;

  constructor(
    contributorRepository: ContributorRepository,
    sonarRepository: SonarRepository,
    wakaTimeRepository: WakaTimeRepository,
  ) {
    this.contributorRepository = contributorRepository;
    this.sonarRepository = sonarRepository;
    this.wakaTimeRepository = wakaTimeRepository;
  }

  async listContributors(
    token: string,
    username: string,
    dateFrom: string | null,
    dateTo: string | null,
  ): Promise<Contributor[]> {
    const contributors = await this.contributorRepository.listContributors(
      token,
      username,
      dateFrom,
      dateTo,
    );

    // Fetch WakaTime summaries
    const wakaTimeSummaries = await this.wakaTimeRepository.getMemberSummaries(username);
    const wakaTimeKeys = [...wakaTimeSummaries.keys()];

    const projectKeys = await this.sonarRepository.listProjectKeys();
    if (projectKeys.length === 0) {
      // No Sonar, but maybe WakaTime
      if (wakaTimeSummaries.size === 0) return contributors;
      return contributors.map((c) => {
        const matchedWaka = matchContributorToAuthor(c.username, wakaTimeKeys);
        return { ...c, wakaTimeMetrics: matchedWaka ? wakaTimeSummaries.get(matchedWaka) ?? null : null };
      });
    }

    // Fetch per-author issues from all projects
    const allIssues = await Promise.all(
      projectKeys.map((key) => this.sonarRepository.getIssuesByAuthor(key)),
    );
    const authorIssues = mergeAuthorIssues(allIssues);

    // Fetch aggregate project metrics for coverage/duplications/debt
    const projectMetrics = await Promise.all(
      projectKeys.map((key) => this.sonarRepository.getProjectMetrics(key)),
    );
    const aggregated = aggregateProjectMetrics(projectMetrics);
    const totalLines = contributors.reduce((sum, c) => sum + c.linesOfCode, 0);

    const authorKeys = [...authorIssues.keys()];

    return contributors.map((c) => {
      const matchedAuthor = matchContributorToAuthor(c.username, authorKeys);
      const issues = matchedAuthor ? authorIssues.get(matchedAuthor) : null;

      if (!issues && !aggregated) return c;

      const ratio = totalLines > 0 ? c.linesOfCode / totalLines : 0;

      const matchedWaka = matchContributorToAuthor(c.username, wakaTimeKeys);

      return {
        ...c,
        sonarMetrics: {
          bugs: issues?.bugs ?? 0,
          codeSmells: issues?.codeSmells ?? 0,
          securityHotspots: issues?.securityHotspots ?? 0,
          vulnerabilities: issues?.vulnerabilities ?? 0,
          coverage: aggregated ? Math.round(aggregated.coverage * 10) / 10 : 0,
          duplications: aggregated ? Math.round(aggregated.duplications * 10) / 10 : 0,
          technicalDebt: aggregated
            ? formatMinutesToDebt(Math.round(parseDebtToMinutes(aggregated.technicalDebt) * ratio))
            : "0min",
          qualityGateStatus: "NONE",
        },
        wakaTimeMetrics: matchedWaka ? wakaTimeSummaries.get(matchedWaka) ?? null : null,
      };
    });
  }
}
