import {
  CONTRIBUTOR_ROLE_DESCRIPTIONS,
  CONTRIBUTOR_ROLE_LABELS,
  CONTRIBUTOR_ROLES,
  DEFAULT_CONTRIBUTOR_ROLE,
  isContributorRole,
} from "../src/contributor_role";

describe("contributor roles", () => {
  it("should offer exactly the two roles the weights are kept for", () => {
    // given / when / then
    expect(CONTRIBUTOR_ROLES).toEqual(["engineer", "lead"]);
  });

  it("should score everybody as an engineer until somebody says otherwise", () => {
    // given / when / then
    // A fleet has far more engineers than leads, so the default has to be the
    // reading most rows want.
    expect(DEFAULT_CONTRIBUTOR_ROLE).toBe("engineer");
    expect(CONTRIBUTOR_ROLES).toContain(DEFAULT_CONTRIBUTOR_ROLE);
  });

  it("should recognise a role and nothing else", () => {
    // given / when / then
    expect(isContributorRole("engineer")).toBe(true);
    expect(isContributorRole("lead")).toBe(true);
    expect(isContributorRole("manager")).toBe(false);
    expect(isContributorRole("")).toBe(false);
    expect(isContributorRole(null)).toBe(false);
    expect(isContributorRole(1)).toBe(false);
  });

  it("should carry a label and a description for every role", () => {
    // given / when / then
    // The select and the chip are built from these, so a role without either
    // would render as its key.
    for (const role of CONTRIBUTOR_ROLES) {
      expect(CONTRIBUTOR_ROLE_LABELS[role]).not.toBe("");
      expect(CONTRIBUTOR_ROLE_DESCRIPTIONS[role]).not.toBe("");
    }
  });

  it("should say what each role is expected to do", () => {
    // given / when / then
    // The description is what makes the choice deliberate: the two roles are
    // told apart by what the score leans on.
    expect(CONTRIBUTOR_ROLE_DESCRIPTIONS.engineer).toMatch(/produce code/u);
    expect(CONTRIBUTOR_ROLE_DESCRIPTIONS.lead).toMatch(/review more than write/u);
  });
});
