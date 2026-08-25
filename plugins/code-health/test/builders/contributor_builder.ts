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
      entityRef: null,
      commits: 25,
      linesAdded: 700,
      linesDeleted: 300,
      linesOfCode: 400,
      changedFiles: 40,
      churnUnit: "lines",
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

  /** A contributor whose provider reports file churn rather than line churn. */
  withFileChurn(changedFiles: number): this {
    this.props = {
      ...this.props,
      churnUnit: "files",
      changedFiles,
      linesAdded: 0,
      linesDeleted: 0,
      linesOfCode: 0,
    };
    return this;
  }

  withoutChurn(): this {
    this.props = {
      ...this.props,
      churnUnit: "none",
      changedFiles: 0,
      linesAdded: 0,
      linesDeleted: 0,
      linesOfCode: 0,
    };
    return this;
  }

  withPullRequests(opened: number, merged: number): this {
    this.props = {
      ...this.props,
      pullRequestsOpened: opened,
      pullRequestsMerged: merged,
    };
    return this;
  }

  withKey(key: string): this {
    this.props = { ...this.props, key };
    return this;
  }

  withCommits(commits: number): this {
    this.props = { ...this.props, commits };
    return this;
  }

  withReviewsGiven(reviewsGiven: number): this {
    this.props = { ...this.props, reviewsGiven };
    return this;
  }

  withEntityRef(entityRef: string | null): this {
    this.props = { ...this.props, entityRef };
    return this;
  }

  withAvatarUrl(avatarUrl: string | null): this {
    this.props = { ...this.props, avatarUrl };
    return this;
  }

  withProfileUrl(profileUrl: string | null): this {
    this.props = { ...this.props, profileUrl };
    return this;
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
