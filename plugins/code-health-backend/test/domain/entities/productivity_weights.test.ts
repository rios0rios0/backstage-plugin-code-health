import { DEFAULT_PRODUCTIVITY_WEIGHTS } from "@rios0rios0/backstage-plugin-code-health-common";
import { productivityWeightsByRoleOf } from "../../../src/domain/entities/productivity_weights";

const NOW = new Date("2026-08-10T12:00:00.000Z");

describe("productivityWeightsByRoleOf", () => {
  it("should score every role on the defaults when nothing was stored", () => {
    // given / when
    const weights = productivityWeightsByRoleOf([]);

    // then
    expect(weights).toEqual(DEFAULT_PRODUCTIVITY_WEIGHTS);
  });

  it("should lay a stored set over the defaults for that role alone", () => {
    // given
    // The table only ever holds what somebody changed, so the engineer keeps
    // the defaults while the lead reads what the administrator wrote.
    const lead = { ...DEFAULT_PRODUCTIVITY_WEIGHTS.lead, reviewsGiven: 0.6 };

    // when
    const weights = productivityWeightsByRoleOf([
      { role: "lead", weights: lead, updatedBy: "user:default/admin", updatedAt: NOW },
    ]);

    // then
    expect(weights.lead).toEqual(lead);
    expect(weights.engineer).toEqual(DEFAULT_PRODUCTIVITY_WEIGHTS.engineer);
  });

  it("should let a later record for the same role replace an earlier one", () => {
    // given
    // The store keeps one row per role, but the fold has to be safe for a
    // list that names one twice rather than depending on it.
    const first = { ...DEFAULT_PRODUCTIVITY_WEIGHTS.engineer, commits: 0.5 };
    const second = { ...DEFAULT_PRODUCTIVITY_WEIGHTS.engineer, commits: 0.9 };

    // when
    const weights = productivityWeightsByRoleOf([
      { role: "engineer", weights: first, updatedBy: null, updatedAt: NOW },
      { role: "engineer", weights: second, updatedBy: null, updatedAt: NOW },
    ]);

    // then
    expect(weights.engineer.commits).toBe(0.9);
  });
});
