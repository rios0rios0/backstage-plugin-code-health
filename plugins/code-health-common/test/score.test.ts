import {
  combineScore,
  FAIR_SCORE,
  formatScoreValue,
  GOOD_SCORE,
  measuredComponent,
  scoreBand,
  shareOf,
  unmeasuredComponent,
} from "../src/score";

const definition = { id: "commits", label: "Commits", weight: 0.5 };
const other = { id: "reviews", label: "Reviews", weight: 0.5 };

describe("combineScore", () => {
  it("should weight every measured component into a whole number out of 100", () => {
    // given
    const components = [
      measuredComponent(definition, 10, 1, "top"),
      measuredComponent(other, 5, 0.5, "half"),
    ];

    // when
    const score = combineScore(components);

    // then
    expect(score.value).toBe(75);
    expect(score.evidence).toBe(1);
    expect(score.components).toBe(components);
  });

  it("should share an unmeasured component's weight among the measured ones", () => {
    // given
    // Half the weight is missing; the other half scored 0.5. Scoring the gap as
    // zero would report 25, which claims evidence that was never collected.
    const components = [
      unmeasuredComponent(definition, "no pipeline ran"),
      measuredComponent(other, 5, 0.5, "half"),
    ];

    // when
    const score = combineScore(components);

    // then
    expect(score.value).toBe(50);
    expect(score.evidence).toBe(0.5);
  });

  it("should have no value when nothing could be measured", () => {
    // given
    const components = [unmeasuredComponent(definition, "nothing"), unmeasuredComponent(other, "nothing")];

    // when
    const score = combineScore(components);

    // then
    expect(score.value).toBeNull();
    expect(score.evidence).toBe(0);
  });

  it("should clamp a normalised figure outside the unit range", () => {
    // given
    const components = [
      { ...definition, value: 3, normalized: 1.5, detail: "over" },
      { ...other, value: -1, normalized: -0.5, detail: "under" },
    ];

    // when
    const score = combineScore(components);

    // then
    expect(score.value).toBe(50);
  });
});

describe("measuredComponent", () => {
  it("should round the normalised figure and keep the raw value", () => {
    // given / when
    const component = measuredComponent(definition, 7, 0.123456, "seven");

    // then
    expect(component).toEqual({
      ...definition,
      value: 7,
      normalized: 0.1235,
      detail: "seven",
    });
  });

  it("should clamp a normalised figure into the unit range", () => {
    // given / when
    const component = measuredComponent(definition, 7, 4, "seven");

    // then
    expect(component.normalized).toBe(1);
  });
});

describe("shareOf", () => {
  it("should cap a share at one", () => {
    // given / when / then
    // Three reviews on one pull request are full coverage, not three hundred
    // percent.
    expect(shareOf(3, 1)).toBe(1);
    expect(shareOf(1, 4)).toBe(0.25);
  });

  it("should read a share of nothing as nothing", () => {
    // given / when / then
    expect(shareOf(3, 0)).toBe(0);
  });
});

describe("scoreBand", () => {
  it("should band a score by the two thresholds", () => {
    // given / when / then
    expect(scoreBand(GOOD_SCORE)).toBe("good");
    expect(scoreBand(GOOD_SCORE - 1)).toBe("fair");
    expect(scoreBand(FAIR_SCORE)).toBe("fair");
    expect(scoreBand(FAIR_SCORE - 1)).toBe("poor");
    expect(scoreBand(null)).toBe("unknown");
  });
});

describe("formatScoreValue", () => {
  it("should print an em dash for a score nothing measured", () => {
    // given / when / then
    expect(formatScoreValue(null)).toBe("—");
    expect(formatScoreValue(62)).toBe("62");
  });
});
