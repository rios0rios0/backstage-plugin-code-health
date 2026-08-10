import { aggregateActivity } from "../../../src/domain/entities/activity";
import { EventBuilder } from "../../builders/event_builder";

describe("aggregateActivity", () => {
  it("should count nothing for an empty window", () => {
    // given / when
    const result = aggregateActivity([]);

    // then
    expect(result.commits).toBe(0);
    expect(result.contributors).toBe(0);
  });

  it("should sum commits and their churn", () => {
    // given
    const events = [
      EventBuilder.commit().withChurn(10, 2, 3).build(),
      EventBuilder.commit().withChurn(5, 1, 1).build(),
    ];

    // when
    const result = aggregateActivity(events);

    // then
    expect(result).toMatchObject({
      commits: 2,
      additions: 15,
      deletions: 3,
      changedFiles: 4,
    });
  });

  it("should treat missing churn as zero rather than as a gap", () => {
    // given
    // Azure DevOps reports no line counts at all, so those fields arrive null
    // and must not turn the sum into NaN.
    const events = [EventBuilder.commit().build()];

    // when
    const result = aggregateActivity(events);

    // then
    expect(result.additions).toBe(0);
    expect(result.deletions).toBe(0);
  });

  it("should count opened and merged pull requests separately", () => {
    // given
    // The two are stored as separate events precisely so a pull request that
    // spans two windows counts once in each.
    const events = [
      EventBuilder.pullRequest("open").build(),
      EventBuilder.pullRequest("open").build(),
      EventBuilder.pullRequest("merged").build(),
    ];

    // when
    const result = aggregateActivity(events);

    // then
    expect(result.pullRequestsOpened).toBe(2);
    expect(result.pullRequestsMerged).toBe(1);
  });

  it("should count anything closed but not merged as abandoned", () => {
    // given
    const events = [EventBuilder.pullRequest("abandoned").build()];

    // when
    const result = aggregateActivity(events);

    // then
    expect(result.pullRequestsAbandoned).toBe(1);
    expect(result.pullRequestsMerged).toBe(0);
  });

  it("should split builds by outcome", () => {
    // given
    const events = [
      EventBuilder.build("succeeded").build(),
      EventBuilder.build("failed").build(),
      EventBuilder.build("canceled").build(),
      EventBuilder.build(null).build(),
    ];

    // when
    const result = aggregateActivity(events);

    // then
    // A cancelled or still-running build counts towards the total but towards
    // neither outcome, so a success rate is never inflated by one.
    expect(result).toMatchObject({ builds: 4, buildsSucceeded: 1, buildsFailed: 1 });
  });

  it("should count releases and tags", () => {
    // given
    const events = [EventBuilder.release().build(), EventBuilder.tag().build()];

    // when
    const result = aggregateActivity(events);

    // then
    expect(result.releases).toBe(1);
    expect(result.tags).toBe(1);
  });

  it("should count distinct contributors across every kind", () => {
    // given
    const events = [
      EventBuilder.commit().withActor("dev@example.com").build(),
      EventBuilder.commit().withActor("dev@example.com").build(),
      EventBuilder.review("approved").withActor("reviewer@example.com").build(),
    ];

    // when
    const result = aggregateActivity(events);

    // then
    // A reviewer contributed to the window even though a review is not
    // repository activity of its own.
    expect(result.contributors).toBe(2);
  });

  it("should ignore an event with no actor when counting contributors", () => {
    // given
    const events = [EventBuilder.release().withActor(null).build()];

    // when
    const result = aggregateActivity(events);

    // then
    expect(result.contributors).toBe(0);
  });

  it("should not count a review as repository activity", () => {
    // given
    const events = [EventBuilder.review("approved").build()];

    // when
    const result = aggregateActivity(events);

    // then
    expect(result.commits).toBe(0);
    expect(result.pullRequestsOpened).toBe(0);
    expect(result.builds).toBe(0);
  });
});
