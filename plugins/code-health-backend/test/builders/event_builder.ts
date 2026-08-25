import type { EventKind } from "@rios0rios0/backstage-plugin-code-health-common";
import type {
  CodeHealthEvent,
  EventOutcome,
} from "../../src/domain/entities/code_health_event";

let counter = 0;

/** Builds an event with unique identifiers, so two calls never collide. */
export class EventBuilder {
  private props: CodeHealthEvent;

  private constructor(kind: EventKind) {
    counter += 1;
    this.props = {
      repositoryId: "repository-1",
      kind,
      externalId: `external-${counter}`,
      occurredAt: new Date("2026-08-09T12:00:00.000Z"),
      actorKey: "dev@example.com",
      actorName: "Dev Example",
      actorAvatarUrl: null,
      outcome: null,
      additions: null,
      deletions: null,
      changedFiles: null,
      payload: null,
    };
  }

  static commit(): EventBuilder {
    return new EventBuilder("commit");
  }

  static pullRequest(outcome: EventOutcome): EventBuilder {
    return new EventBuilder("pull_request").withOutcome(outcome);
  }

  static review(outcome: EventOutcome): EventBuilder {
    return new EventBuilder("pr_review").withOutcome(outcome);
  }

  static build(outcome: EventOutcome | null): EventBuilder {
    const builder = new EventBuilder("build");
    return outcome === null ? builder : builder.withOutcome(outcome);
  }

  static release(): EventBuilder {
    return new EventBuilder("release");
  }

  static tag(): EventBuilder {
    return new EventBuilder("tag");
  }

  withRepository(repositoryId: string): EventBuilder {
    this.props = { ...this.props, repositoryId };
    return this;
  }

  withActor(actorKey: string | null, actorName?: string): EventBuilder {
    this.props = {
      ...this.props,
      actorKey,
      actorName: actorName ?? this.props.actorName,
    };
    return this;
  }

  withOutcome(outcome: EventOutcome): EventBuilder {
    this.props = { ...this.props, outcome };
    return this;
  }

  /** File churn only, the way Azure DevOps reports it — no line counts at all. */
  withFileChurn(changedFiles: number): EventBuilder {
    this.props = {
      ...this.props,
      additions: null,
      deletions: null,
      changedFiles,
    };
    return this;
  }

  withChurn(additions: number, deletions: number, changedFiles?: number): EventBuilder {
    this.props = {
      ...this.props,
      additions,
      deletions,
      ...(changedFiles === undefined ? {} : { changedFiles }),
    };
    return this;
  }

  at(instant: string): EventBuilder {
    this.props = { ...this.props, occurredAt: new Date(instant) };
    return this;
  }

  build(): CodeHealthEvent {
    return { ...this.props };
  }
}
