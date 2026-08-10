import { eventId } from "../../../src/domain/entities/code_health_event";
import { isBackfillComplete } from "../../../src/domain/entities/ingestion_state";
import { repositoryFullName } from "../../../src/domain/entities/tracked_repository";
import { anIngestionState } from "../../builders/ingestion_state_builder";

describe("repositoryFullName", () => {
  it("should render owner and name when there is no project level", () => {
    // given
    const repository = { owner: "rios0rios0", project: null, name: "pipelines" };

    // when
    const result = repositoryFullName(repository);

    // then
    expect(result).toBe("rios0rios0/pipelines");
  });

  it("should include the project level when the platform has one", () => {
    // given
    const repository = { owner: "example-org", project: "platform", name: "gateway" };

    // when
    const result = repositoryFullName(repository);

    // then
    expect(result).toBe("example-org/platform/gateway");
  });
});

describe("eventId", () => {
  it("should combine repository, kind and provider identifier", () => {
    // given
    const event = { repositoryId: "abc123", kind: "commit" as const, externalId: "deadbeef" };

    // when
    const result = eventId(event);

    // then
    expect(result).toBe("abc123:commit:deadbeef");
  });

  it("should not collide across kinds that share a provider identifier", () => {
    // given
    // A build and a pull request can legitimately carry the same numeric id,
    // so the kind has to be part of the key or one would overwrite the other.
    const shared = { repositoryId: "abc123", externalId: "42" };

    // when
    const build = eventId({ ...shared, kind: "build" });
    const pullRequest = eventId({ ...shared, kind: "pull_request" });

    // then
    expect(build).not.toBe(pullRequest);
  });
});

describe("isBackfillComplete", () => {
  it("should report complete when the cursor reached the floor", () => {
    // given
    const state = anIngestionState({
      backfillFloor: "2025-08-10",
      backfillCursor: "2025-08-10",
    });

    // when
    const result = isBackfillComplete(state);

    // then
    expect(result).toBe(true);
  });

  it("should report complete when the cursor moved past the floor", () => {
    // given
    const state = anIngestionState({
      backfillFloor: "2025-08-10",
      backfillCursor: "2025-08-09",
    });

    // when
    const result = isBackfillComplete(state);

    // then
    expect(result).toBe(true);
  });

  it("should report incomplete while the cursor is still above the floor", () => {
    // given
    const state = anIngestionState({
      backfillFloor: "2025-08-10",
      backfillCursor: "2026-01-01",
    });

    // when
    const result = isBackfillComplete(state);

    // then
    expect(result).toBe(false);
  });
});
