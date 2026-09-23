/**
 * What a person is expected to spend their time on, which decides how their
 * productivity score is weighted.
 *
 * Two roles, on purpose. An engineer is expected to produce code, so their
 * score leans on commits, merged pull requests and churn; a lead is expected
 * to review more than they write, so theirs leans on reviews and on the
 * documentation that goes with steering a team. Read on one set of weights a
 * lead who spent the month reviewing looks like an engineer who wrote nothing,
 * which is the opposite of what the row is for.
 *
 * A closed set rather than free text, for the same reason an exclusion reason
 * is: the role is what somebody's score is *read through*, and a role nobody
 * can enumerate is a role nobody can configure weights for. Everybody is an
 * engineer until an administrator says otherwise, because a fleet has far more
 * engineers than leads and the default has to be the reading most rows want.
 */
export type ContributorRole = "engineer" | "lead";

export const CONTRIBUTOR_ROLES: readonly ContributorRole[] = ["engineer", "lead"];

/** What a person is scored as until an administrator assigns a role. */
export const DEFAULT_CONTRIBUTOR_ROLE: ContributorRole = "engineer";

export const isContributorRole = (value: unknown): value is ContributorRole =>
  typeof value === "string" && (CONTRIBUTOR_ROLES as readonly string[]).includes(value);

/** What the column, the chip and the select say. */
export const CONTRIBUTOR_ROLE_LABELS: Readonly<Record<ContributorRole, string>> = {
  engineer: "Engineer",
  lead: "Lead",
};

/** The sentence under each option, so the choice is made on purpose. */
export const CONTRIBUTOR_ROLE_DESCRIPTIONS: Readonly<Record<ContributorRole, string>> = {
  engineer:
    "Expected to produce code. The score leans on commits, merged pull requests and churn, with reviews behind them.",
  lead:
    "Expected to review more than write. The score leans on reviews given and documentation, with output behind them.",
};
