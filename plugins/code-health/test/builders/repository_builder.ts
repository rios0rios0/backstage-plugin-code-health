import type { BadgeStatus } from "../../src/domain/entities/badge_status";
import type { ComplianceStatus } from "../../src/domain/entities/compliance_status";
import type { Repository } from "../../src/domain/entities/repository";
import type { Release } from "../../src/domain/entities/release";
import type { Tag } from "../../src/domain/entities/tag";
import type { CIState, WorkflowStatus } from "../../src/domain/entities/workflow_status";

let counter = 0;

export class RepositoryBuilder {
  private props: Repository;

  constructor() {
    counter += 1;
    this.props = {
      id: `id-${counter}`,
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
      hasWorkflows: false,
      branches: ["main"],
      sonarMetrics: null,
      complianceStatus: null,
      badgeStatus: null,
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
    this.props = { ...this.props, ciStatus, hasWorkflows: true };
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

  build(): Repository {
    return { ...this.props };
  }
}
