import { CODE_HEALTH_API_VERSION, CODE_HEALTH_PLUGIN_ID } from "../src/api";
import { EMPTY_BACKFILL_PROGRESS } from "../src/coverage";
import { EMPTY_REPOSITORY_ACTIVITY } from "../src/repository_summary";

describe("CODE_HEALTH_PLUGIN_ID", () => {
  it("should be the id both plugins register under", () => {
    // given / when
    const id = CODE_HEALTH_PLUGIN_ID;

    // then
    // The frontend reaches the backend with `discoveryApi.getBaseUrl(id)`, which
    // only resolves because the backend plugin claims this exact id.
    expect(id).toBe("code-health");
    expect(CODE_HEALTH_API_VERSION).toBe("v1");
  });
});

describe("EMPTY_REPOSITORY_ACTIVITY", () => {
  it("should count nothing on every field", () => {
    // given
    const activity = EMPTY_REPOSITORY_ACTIVITY;

    // when
    const values = Object.values(activity);

    // then
    // A repository with no events in the window renders from this value, so a
    // non-zero default would silently invent activity that never happened.
    expect(values).toHaveLength(13);
    expect(values.every((value) => value === 0)).toBe(true);
  });
});

describe("EMPTY_BACKFILL_PROGRESS", () => {
  it("should report no progress before the first ingestion tick", () => {
    // given
    const progress = EMPTY_BACKFILL_PROGRESS;

    // when
    const values = Object.values(progress);

    // then
    expect(values).toHaveLength(6);
    expect(values.every((value) => value === 0)).toBe(true);
  });
});
