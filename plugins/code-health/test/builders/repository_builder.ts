import type {
  BadgeStatus,
  CIState,
  ComplianceStatus,
  Release,
  RepositoryActivity,
  RepositorySummary,
  Tag,
  WorkflowStatus,
} from "@rios0rios0/backstage-plugin-code-health-common";
import { EMPTY_REPOSITORY_ACTIVITY } from "@rios0rios0/backstage-plugin-code-health-common";

let counter = 0;

export class RepositoryBuilder {
  private props: RepositorySummary;

  constructor() {
    counter += 1;
    this.props = {
      id: `id-${counter}`,
      entityRef: `component:default/repo-${counter}`,
      platform: "github",
      name: `repo-${counter}`,
      fullName: `user/repo-${counter}`,
      url: `https://github.com/user/repo-${counter}`,
      description: null,
      primaryLanguage: null,
      visibility: "PUBLIC",
      isArchived: false,
      isFork: false,
      defaultBranch: "main",
      updatedAt: "2026-01-01T00:00:00Z",
      ciStatus: null,
      latestRelease: null,
      latestTag: null,
      branches: ["main"],
      sonarMetrics: null,
      complianceStatus: null,
      badgeStatus: null,
      wakaTimeMetrics: null,
      activity: EMPTY_REPOSITORY_ACTIVITY,
    };
  }

  static create(): RepositoryBuilder {
    return new RepositoryBuilder();
  }

  withName(name: string): this {
    this.props = { ...this.props, name, fullName: `user/${name}`, url: `https://github.com/user/${name}` };
    return this;
  }

  withDescription(description: string): this {
    this.props = { ...this.props, description };
    return this;
  }

  withLanguage(language: string): this {
    this.props = { ...this.props, primaryLanguage: language };
    return this;
  }

  withCiStatus(state: CIState): this {
    const ciStatus: WorkflowStatus = {
      state,
      commitSha: "abc123",
      commitMessage: "test commit",
      commitUrl: `${this.props.url}/commit/abc123`,
    };
    this.props = { ...this.props, ciStatus };
    return this;
  }

  withLatestRelease(overrides: Partial<Release> = {}): this {
    const release: Release = {
      tagName: "v1.0.0",
      name: "Release 1.0.0",
      publishedAt: "2026-01-01T00:00:00Z",
      url: `${this.props.url}/releases/tag/v1.0.0`,
      isPrerelease: false,
      ...overrides,
    };
    this.props = { ...this.props, latestRelease: release };
    return this;
  }

  withLatestTag(overrides: Partial<Tag> = {}): this {
    const tag: Tag = {
      name: "v1.0.0",
      commitSha: "abc123",
      ...overrides,
    };
    this.props = { ...this.props, latestTag: tag };
    return this;
  }

  withUpdatedAt(date: string): this {
    this.props = { ...this.props, updatedAt: date };
    return this;
  }

  asArchived(): this {
    this.props = { ...this.props, isArchived: true };
    return this;
  }

  asFork(): this {
    this.props = { ...this.props, isFork: true };
    return this;
  }

  asPrivate(): this {
    this.props = { ...this.props, visibility: "PRIVATE" };
    return this;
  }

  withComplianceStatus(status: ComplianceStatus): this {
    this.props = { ...this.props, complianceStatus: status };
    return this;
  }

  withBadgeStatus(status: BadgeStatus): this {
    this.props = { ...this.props, badgeStatus: status };
    return this;
  }

  withActivity(overrides: Partial<RepositoryActivity>): this {
    this.props = {
      ...this.props,
      activity: { ...EMPTY_REPOSITORY_ACTIVITY, ...overrides },
    };
    return this;
  }

  build(): RepositorySummary {
    return { ...this.props };
  }
}
