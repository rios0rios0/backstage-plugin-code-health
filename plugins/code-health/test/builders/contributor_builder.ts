import type {
  ContributorSummary,
  SonarMetrics,
  WakaTimeMetrics,
} from "@rios0rios0/backstage-plugin-code-health-common";

let counter = 0;

export class ContributorBuilder {
  private props: ContributorSummary;

  constructor() {
    counter += 1;
    this.props = {
      key: `user-${counter}`,
      displayName: `user-${counter}`,
      avatarUrl: `https://avatars.githubusercontent.com/user-${counter}`,
      profileUrl: `https://github.com/user-${counter}`,
      commits: 25,
      linesAdded: 700,
      linesDeleted: 300,
      linesOfCode: 400,
      changedFiles: 40,
      pullRequestsOpened: 10,
      pullRequestsMerged: 8,
      reviewsGiven: 10,
      reviewsApproved: 5,
      reviewsRejected: 2,
      prApprovalRate: 50,
      pipelineRuns: 10,
      pipelineRunsSucceeded: 9,
      pipelineSuccessRate: 90,
      repositories: 3,
      sonarMetrics: null,
      wakaTimeMetrics: null,
    };
  }

  static create(): ContributorBuilder {
    return new ContributorBuilder();
  }

  withDisplayName(displayName: string): this {
    this.props = {
      ...this.props,
      key: displayName,
      displayName,
      profileUrl: `https://github.com/${displayName}`,
      avatarUrl: `https://avatars.githubusercontent.com/${displayName}`,
    };
    return this;
  }

  /** A commit author with no linked account, which is common on Azure DevOps. */
  withoutProfile(): this {
    this.props = { ...this.props, avatarUrl: null, profileUrl: null };
    return this;
  }

  withLinesOfCode(lines: number): this {
    this.props = { ...this.props, linesOfCode: lines };
    return this;
  }

  withReviewsApproved(count: number): this {
    this.props = { ...this.props, reviewsApproved: count };
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

  withWakaTimeMetrics(metrics: WakaTimeMetrics): this {
    this.props = { ...this.props, wakaTimeMetrics: metrics };
    return this;
  }

  build(): ContributorSummary {
    return { ...this.props };
  }
}
