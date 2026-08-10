import { formatDuration } from "../../../src/domain/entities/wakatime_metrics";

describe("formatDuration", () => {
  it("should return 0m when totalSeconds is 0", () => {
    // given
    const seconds = 0;

    // when
    const result = formatDuration(seconds);

    // then
    expect(result).toBe("0m");
  });

  it("should return 0m when totalSeconds is less than 60", () => {
    // given
    const seconds = 59;

    // when
    const result = formatDuration(seconds);

    // then
    expect(result).toBe("0m");
  });

  it("should return 1m when totalSeconds is exactly 60", () => {
    // given
    const seconds = 60;

    // when
    const result = formatDuration(seconds);

    // then
    expect(result).toBe("1m");
  });

  it("should return 59m when totalSeconds is 3599", () => {
    // given
    const seconds = 3599;

    // when
    const result = formatDuration(seconds);

    // then
    expect(result).toBe("59m");
  });

  it("should return hours only when totalSeconds is exactly on the hour", () => {
    // given
    const seconds = 3600;

    // when
    const result = formatDuration(seconds);

    // then
    expect(result).toBe("1h");
  });

  it("should return hours and minutes when totalSeconds has both", () => {
    // given
    const seconds = 3660;

    // when
    const result = formatDuration(seconds);

    // then
    expect(result).toBe("1h 1m");
  });

  it("should return hours only when minutes are zero", () => {
    // given
    const seconds = 7200;

    // when
    const result = formatDuration(seconds);

    // then
    expect(result).toBe("2h");
  });

  it("should handle large values correctly", () => {
    // given
    const seconds = 90060;

    // when
    const result = formatDuration(seconds);

    // then
    expect(result).toBe("25h 1m");
  });
});
