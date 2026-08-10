import type { Contributor } from "../../src/domain/entities/contributor";
import type { SonarMetrics } from "../../src/domain/entities/sonar_metrics";

let counter = 0;

export class ContributorBuilder {
  private props: Contributor;

  constructor() {
    counter += 1;
    this.props = {
      username: `user-${counter}`,
      avatarUrl: `https://avatars.githubusercontent.com/user-${counter}`,
      profileUrl: `https://github.com/user-${counter}`,
      approvedPRs: 5,
      totalPRs: 10,
      rejectedPRs: 2,
      linesOfCode: 1000,
      linesAdded: 700,
      linesDeleted: 300,
      prApprovalRate: 80,
      pipelineSuccessRate: 90,
      totalPipelineRuns: 10,
      successfulPipelineRuns: 9,
      sonarMetrics: null,
      wakaTimeMetrics: null,
    };
  }

  static create(): ContributorBuilder {
    return new ContributorBuilder();
  }

  withUsername(username: string): this {
    this.props = {
      ...this.props,
      username,
      profileUrl: `https://github.com/${username}`,
      avatarUrl: `https://avatars.githubusercontent.com/${username}`,
    };
    return this;
  }

  withLinesOfCode(lines: number): this {
    this.props = { ...this.props, linesOfCode: lines };
    return this;
  }

  withApprovedPRs(count: number): this {
    this.props = { ...this.props, approvedPRs: count };
    return this;
  }

  withPrApprovalRate(rate: number): this {
    this.props = { ...this.props, prApprovalRate: rate };
    return this;
  }

  withPipelineSuccessRate(rate: number): this {
    this.props = { ...this.props, pipelineSuccessRate: rate };
    return this;
  }

  withSonarMetrics(metrics: SonarMetrics): this {
    this.props = { ...this.props, sonarMetrics: metrics };
    return this;
  }

  build(): Contributor {
    return { ...this.props };
  }
}
