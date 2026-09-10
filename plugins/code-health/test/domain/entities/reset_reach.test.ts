import {
  RESET_MONTHS,
  daysInMonths,
  fullRetentionReach,
  resetReachOptions,
} from "../../../src/domain/entities/reset_reach";

/**
 * A September instant, so every span asserted below sits inside one
 * daylight-saving regime wherever the suite runs. The counts a reach reports
 * are calendar arithmetic, and a test that only passes north of the equator
 * would be measuring the machine rather than the code.
 */
const NOW = new Date(2026, 8, 9, 12, 0, 0, 0);

describe("daysInMonths", () => {
  it("should count the days the calendar months actually have", () => {
    // given / when / then
    // August has 31, July and August 62, June through August 92.
    expect(daysInMonths(1, NOW)).toBe(31);
    expect(daysInMonths(2, NOW)).toBe(62);
    expect(daysInMonths(3, NOW)).toBe(92);
    expect(daysInMonths(12, NOW)).toBe(365);
  });

  it("should count a short month as short rather than as thirty days", () => {
    // given
    // A month before the fifteenth of March 2026 is the fifteenth of February,
    // which is twenty-eight days rather than the thirty a fixed block assumes.
    const march = new Date(2026, 2, 15, 12, 0, 0, 0);

    // when / then
    expect(daysInMonths(1, march)).toBe(28);
  });
});

describe("fullRetentionReach", () => {
  it("should name the whole retention in days", () => {
    // given / when
    const reach = fullRetentionReach(365);

    // then
    expect(reach).toEqual({
      days: 365,
      label: "Everything retained (365 days)",
      confirmLabel: "365 days",
    });
  });

  it("should not write a plural over a retention of one day", () => {
    // given / when
    const reach = fullRetentionReach(1);

    // then
    expect(reach.label).toBe("Everything retained (1 day)");
  });
});

describe("resetReachOptions", () => {
  it("should offer every month count and the retention, shortest first", () => {
    // given / when
    const options = resetReachOptions(400, NOW);

    // then
    expect(options).toHaveLength(RESET_MONTHS.length + 1);
    expect(options.map((option) => option.confirmLabel)).toEqual([
      "1 month",
      "2 months",
      "3 months",
      "6 months",
      "9 months",
      "12 months",
      "400 days",
    ]);
  });

  it("should show each reach in days beside the months it was asked for", () => {
    // given / when
    const options = resetReachOptions(400, NOW);

    // then
    // The day count is what the request carries, so it is on the screen rather
    // than left for a reader to work out from a month count.
    expect(options.map((option) => option.label).slice(0, 3)).toEqual([
      "1 month (31 days)",
      "2 months (62 days)",
      "3 months (92 days)",
    ]);
    expect(options.every((option) => option.label.includes(`${option.days} day`))).toBe(true);
  });

  it("should leave out a reach the backend keeps nothing behind", () => {
    // given / when
    // Thirty days of retention has nothing a month-long reach could collect.
    const options = resetReachOptions(30, NOW);

    // then
    expect(options).toEqual([
      { days: 30, label: "Everything retained (30 days)", confirmLabel: "30 days" },
    ]);
  });

  it("should not offer the retention twice under two names", () => {
    // given / when
    // Twelve months from this instant is exactly the 365 days retained.
    const options = resetReachOptions(365, NOW);

    // then
    expect(options.map((option) => option.confirmLabel)).toEqual([
      "1 month",
      "2 months",
      "3 months",
      "6 months",
      "9 months",
      "365 days",
    ]);
    expect(options.filter((option) => option.days === 365)).toHaveLength(1);
  });

  it("should end on the whole retention, which is what a dialog opens on", () => {
    // given / when
    const options = resetReachOptions(400, NOW);

    // then
    const [last] = [...options].reverse();
    expect(last).toEqual(fullRetentionReach(400));
  });
});
