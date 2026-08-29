import {
  buildActivityJql,
  buildOldestOpenJql,
  buildOpenByPriorityJql,
  buildOpenIssuesJql,
  buildStatusCategories,
  jqlDate,
  parseIssue,
  quoteJql,
  resolveStoryPointsField,
  scopeKey,
  tallyContributors,
  tallyRepository,
  throughputPerWeek,
  toOpenIssue,
  widenWindow,
  type JiraIssueFacts,
  type JiraScope,
  type JiraStatusCategory,
} from "../../../../src/infrastructure/services/atlassian/jira_queries";
import {
  JiraIssueBuilder,
  STATUS_IDS,
  statusDescriptors,
} from "../../../builders/jira_issue_builder";

const SCOPE: JiraScope = { projectKey: "PLAT", component: null };

const WINDOW = {
  from: new Date("2026-08-01T00:00:00.000Z"),
  to: new Date("2026-08-08T00:00:00.000Z"),
};

const categories = (): ReadonlyMap<string, JiraStatusCategory> =>
  buildStatusCategories(statusDescriptors());

const parse = (
  node: ReturnType<JiraIssueBuilder["build"]>,
  storyPointsField: string | null = null,
): JiraIssueFacts => {
  const facts = parseIssue(node, { storyPointsField, categories: categories() });
  if (facts === null) throw new Error("expected the issue to parse");
  return facts;
};

describe("quoteJql", () => {
  it("should escape a value that would otherwise close the string literal", () => {
    // given
    // Project keys come from a catalog annotation, which is a YAML file anybody
    // with write access to a repository can edit.
    const value = 'PLAT" OR project = "SECRET';

    // when
    const quoted = quoteJql(value);

    // then
    expect(quoted).toBe('"PLAT\\" OR project = \\"SECRET"');
  });

  it("should escape a backslash before it can escape the quote", () => {
    // given
    const value = "back\\slash";

    // when
    const quoted = quoteJql(value);

    // then
    expect(quoted).toBe('"back\\\\slash"');
  });
});

describe("widenWindow", () => {
  it("should widen a window by a day at each end", () => {
    // given
    // JQL resolves a bare date in the token owner's Jira profile timezone, so a
    // bound stated to the day is up to a day out depending on whose token is
    // configured.
    const window = WINDOW;

    // when
    const widened = widenWindow(window);

    // then
    expect(jqlDate(widened.from)).toBe("2026-07-31");
    expect(jqlDate(widened.to)).toBe("2026-08-09");
  });
});

describe("buildActivityJql", () => {
  it("should filter on updated so one query answers three questions", () => {
    // given
    // `updated` is the only field Jira moves for created, resolved and
    // commented alike.
    const scope = SCOPE;

    // when
    const jql = buildActivityJql(scope, WINDOW, null);

    // then
    expect(jql).toBe(
      'project = "PLAT" AND updated >= 2026-07-31 AND updated <= 2026-08-09 ORDER BY updated DESC',
    );
  });

  it("should narrow to a component when the entity names one", () => {
    // given
    const scope: JiraScope = { projectKey: "PLAT", component: "gateway" };

    // when
    const jql = buildActivityJql(scope, WINDOW, null);

    // then
    expect(jql).toContain('component = "gateway"');
  });

  it("should bracket an operator filter so an OR inside it cannot widen the query", () => {
    // given
    const filter = "labels = squad-a OR labels = squad-b";

    // when
    const jql = buildActivityJql(SCOPE, WINDOW, filter);

    // then
    expect(jql).toContain("(labels = squad-a OR labels = squad-b)");
  });

  it("should ignore a blank filter rather than appending an empty clause", () => {
    // given
    const filter = "   ";

    // when
    const jql = buildActivityJql(SCOPE, WINDOW, filter);

    // then
    expect(jql).not.toContain("()");
  });
});

describe("open-issue queries", () => {
  it("should match on the status category, which no site can rename", () => {
    // given
    // A query naming statuses works on the site it was written for and quietly
    // returns nothing on the next one.
    const scope = SCOPE;

    // when
    const open = buildOpenIssuesJql(scope, null);
    const oldest = buildOldestOpenJql(scope, null);
    const byPriority = buildOpenByPriorityJql(scope, "Highest", null);

    // then
    expect(open).toBe('project = "PLAT" AND statusCategory != Done');
    expect(oldest).toBe('project = "PLAT" AND statusCategory != Done ORDER BY created ASC');
    expect(byPriority).toBe(
      'project = "PLAT" AND statusCategory != Done AND priority = "Highest"',
    );
  });
});

describe("scopeKey", () => {
  it("should fold case so one project reached two ways is one scope", () => {
    // given
    const left: JiraScope = { projectKey: "plat", component: "Gateway" };
    const right: JiraScope = { projectKey: "PLAT", component: "gateway" };

    // when
    const keys = [scopeKey(left), scopeKey(right)];

    // then
    expect(keys[0]).toBe(keys[1]);
  });
});

describe("resolveStoryPointsField", () => {
  it("should prefer an explicitly pinned field over anything found by name", () => {
    // given
    const fields = [{ id: "customfield_10016", name: "Story Points" }];

    // when
    const resolved = resolveStoryPointsField(fields, "customfield_99999");

    // then
    expect(resolved).toBe("customfield_99999");
  });

  it("should prefer the company-managed name when a site carries both", () => {
    // given
    // Company-managed projects call it `Story Points` and team-managed ones
    // `Story point estimate`; a site running both carries two different ids.
    const fields = [
      { id: "customfield_10032", name: "Story point estimate" },
      { id: "customfield_10016", name: "Story Points" },
    ];

    // when
    const resolved = resolveStoryPointsField(fields, null);

    // then
    expect(resolved).toBe("customfield_10016");
  });

  it("should report null when the site has no story-point field at all", () => {
    // given
    // Null propagates to an em dash. Guessing a field would produce a column of
    // zeroes that reads as a team estimating nothing.
    const fields = [{ id: "customfield_10001", name: "Sprint" }, { name: "no id" }];

    // when
    const resolved = resolveStoryPointsField(fields, "  ");

    // then
    expect(resolved).toBeNull();
  });
});

describe("buildStatusCategories", () => {
  it("should map status ids onto the three categories Jira defines", () => {
    // given
    const statuses = [
      ...statusDescriptors(),
      { id: "10099", name: "Odd", statusCategory: { key: "unheard-of" } },
      { name: "no id", statusCategory: { key: "done" } },
    ];

    // when
    const map = buildStatusCategories(statuses);

    // then
    expect(map.get(STATUS_IDS.inProgress)).toBe("indeterminate");
    expect(map.get(STATUS_IDS.done)).toBe("done");
    expect(map.has("10099")).toBe(false);
  });
});

describe("parseIssue", () => {
  it("should discard a hit with no key", () => {
    // given
    const node = JiraIssueBuilder.create().withoutKey().build();

    // when
    const facts = parseIssue(node, { storyPointsField: null, categories: categories() });

    // then
    expect(facts).toBeNull();
  });

  it("should lowercase the accountId, which is the source key", () => {
    // given
    // The accountId is the only identifier GDPR-era Jira returns on every
    // endpoint, and two rows differing only in case are two people to a
    // primary key.
    const node = JiraIssueBuilder.create()
      .withReporter(JiraIssueBuilder.account("ABC123"))
      .build();

    // when
    const facts = parse(node);

    // then
    expect(facts.reporter?.accountId).toBe("abc123");
    expect(facts.reporter?.avatarUrl).toBe("https://avatar.example/ABC123");
  });

  it("should fall back to the creator when an issue has no reporter", () => {
    // given
    const node = JiraIssueBuilder.create().build();
    const withCreator = {
      ...node,
      fields: { ...node.fields, creator: JiraIssueBuilder.account("creator-1") },
    };

    // when
    const facts = parse(withCreator);

    // then
    expect(facts.reporter?.accountId).toBe("creator-1");
  });

  it("should read the start of work from the category, never from a status name", () => {
    // given
    // The changelog reports status names, which any team can rename; only the
    // category is Jira's own.
    const node = JiraIssueBuilder.create()
      .withTransition({ accountId: "dev", at: "2026-08-03T10:00:00.000Z", to: STATUS_IDS.inProgress })
      .withTransition({ accountId: "dev", at: "2026-08-02T10:00:00.000Z", to: STATUS_IDS.inProgress })
      .withTransition({
        accountId: "dev",
        at: "2026-08-04T10:00:00.000Z",
        from: STATUS_IDS.inProgress,
        to: STATUS_IDS.done,
      })
      .build();

    // when
    const facts = parse(node);

    // then
    // The earliest move into an in-progress status wins, whatever order the
    // changelog listed them in.
    expect(facts.startedAt?.toISOString()).toBe("2026-08-02T10:00:00.000Z");
    expect(facts.transitions).toHaveLength(3);
  });

  it("should fall back to the last transition into done when no resolution date is set", () => {
    // given
    // A workflow that moves an issue to a done status without setting a
    // resolution is one this plugin should report the way the site does.
    const node = JiraIssueBuilder.create()
      .withResolution(null)
      .withTransition({
        accountId: "dev",
        at: "2026-08-05T12:00:00.000Z",
        from: STATUS_IDS.inProgress,
        to: STATUS_IDS.done,
      })
      .build();

    // when
    const facts = parse(node);

    // then
    expect(facts.resolvedAt?.toISOString()).toBe("2026-08-05T12:00:00.000Z");
  });

  it("should ignore changelog entries for fields other than status", () => {
    // given
    const node = JiraIssueBuilder.create()
      .withFieldChange({ accountId: "dev", at: "2026-08-03T10:00:00.000Z", field: "assignee" })
      .build();

    // when
    const facts = parse(node);

    // then
    expect(facts.transitions).toHaveLength(0);
    // The author is still an account the identity screen should know about.
    expect(facts.accounts.map((account) => account.accountId)).toContain("dev");
  });

  it("should book worklog against when the work happened, not when it was logged", () => {
    // given
    // A Friday afternoon logged on the following Monday is Friday's work, and
    // counting it on the Monday moves effort between two windows the dashboard
    // shows side by side.
    const node = JiraIssueBuilder.create()
      .withWorklog([{ accountId: "dev", started: "2026-08-07T16:00:00.000Z" }])
      .build();

    // when
    const facts = parse(node);

    // then
    expect(facts.worklog?.[0]?.at.toISOString()).toBe("2026-08-07T16:00:00.000Z");
  });

  it("should tell an absent comment list apart from an empty one", () => {
    // given
    // A site whose search returns no comment container has not said there were
    // no comments; it has said nothing.
    const absent = JiraIssueBuilder.create().build();
    const empty = JiraIssueBuilder.create().withComments([]).build();

    // when
    const facts = [parse(absent), parse(empty)];

    // then
    expect(facts[0]?.comments).toBeNull();
    expect(facts[1]?.comments).toEqual([]);
  });

  it("should flag an issue whose lists the search capped", () => {
    // given
    const node = JiraIssueBuilder.create()
      .withComments([{ accountId: "dev", created: "2026-08-02T09:00:00.000Z" }], 45)
      .build();

    // when
    const facts = parse(node);

    // then
    expect(facts.truncated).toBe(true);
  });

  it("should flag a changelog the search capped", () => {
    // given
    const node = JiraIssueBuilder.create().withTruncatedChangelog(400).build();

    // when
    const facts = parse(node);

    // then
    expect(facts.truncated).toBe(true);
  });

  it("should read a story point value however the custom field carries it", () => {
    // given
    // Jira returns a numeric custom field as a number on one site and as a
    // string on another, depending on the field type.
    const asNumber = JiraIssueBuilder.create().withStoryPoints("customfield_10016", 5).build();
    const asString = JiraIssueBuilder.create().withStoryPoints("customfield_10016", "8").build();
    const unusable = JiraIssueBuilder.create()
      .withStoryPoints("customfield_10016", "not a number")
      .build();

    // when
    const points = [asNumber, asString, unusable].map(
      (node) => parse(node, "customfield_10016").storyPoints,
    );

    // then
    expect(points).toEqual([5, 8, null]);
  });

  it("should report no story points at all when the field was never resolved", () => {
    // given
    const node = JiraIssueBuilder.create().withStoryPoints("customfield_10016", 5).build();

    // when
    const facts = parse(node, null);

    // then
    expect(facts.storyPoints).toBeNull();
  });
});

describe("parseIssue, on the shapes Jira actually returns", () => {
  it("should survive a hit with a key and nothing else", () => {
    // given
    // An issue with an unreadable field is still an issue somebody created, so
    // each field degrades on its own rather than the hit being discarded.
    const node = { key: "PLAT-1" };

    // when
    const facts = parse(node);

    // then
    expect(facts).toMatchObject({
      key: "PLAT-1",
      summary: null,
      typeBucket: "other",
      createdAt: null,
      resolvedAt: null,
      comments: null,
      transitions: [],
    });
  });

  it("should treat an unparseable date as absent rather than as the epoch", () => {
    // given
    const node = JiraIssueBuilder.create().withCreated("the other day").build();

    // when
    const facts = parse(node);

    // then
    expect(facts.createdAt).toBeNull();
  });

  it("should keep an account whose display name Jira withheld", () => {
    // given
    // Jira omits fields a person made private, and the accountId is the only
    // one it always returns.
    const node = JiraIssueBuilder.create()
      .withReporter({ accountId: "abc" })
      .build();

    // when
    const facts = parse(node);

    // then
    expect(facts.reporter).toEqual({
      accountId: "abc",
      rawAccountId: "abc",
      displayName: null,
      email: null,
      avatarUrl: null,
    });
  });

  it("should drop a comment with no author or no date", () => {
    // given
    const node = JiraIssueBuilder.create().build();
    const withOddComments = {
      ...node,
      fields: {
        ...node.fields,
        comment: {
          total: 2,
          maxResults: 2,
          comments: [
            { created: "2026-08-02T09:00:00.000Z" },
            { author: { accountId: "dev" }, created: "never" },
          ],
        },
      },
    };

    // when
    const facts = parse(withOddComments);

    // then
    expect(facts.comments).toEqual([]);
  });

  it("should fall back to when a worklog entry was booked if it names no start", () => {
    // given
    const node = JiraIssueBuilder.create().build();
    const withWorklog = {
      ...node,
      fields: {
        ...node.fields,
        worklog: {
          total: 1,
          maxResults: 1,
          worklogs: [
            { author: { accountId: "dev" }, created: "2026-08-02T09:00:00.000Z" },
          ],
        },
      },
    };

    // when
    const facts = parse(withWorklog);

    // then
    expect(facts.worklog?.[0]?.at.toISOString()).toBe("2026-08-02T09:00:00.000Z");
  });

  it("should ignore a changelog entry with no date and one with no items", () => {
    // given
    const node = JiraIssueBuilder.create().build();
    const withOddHistories = {
      ...node,
      changelog: {
        total: 2,
        maxResults: 2,
        histories: [
          { author: { accountId: "dev" }, created: "never", items: [] },
          { author: { accountId: "dev" }, created: "2026-08-02T09:00:00.000Z" },
        ],
      },
    };

    // when
    const facts = parse(withOddHistories);

    // then
    expect(facts.transitions).toEqual([]);
    expect(facts.accounts.map((account) => account.accountId)).toEqual(["dev"]);
  });

  it("should keep the latest move into done when an issue was closed twice", () => {
    // given
    const node = JiraIssueBuilder.create()
      .withResolution(null)
      .withTransition({ accountId: "dev", at: "2026-08-05T09:00:00.000Z", to: STATUS_IDS.done })
      .withTransition({ accountId: "dev", at: "2026-08-03T09:00:00.000Z", to: STATUS_IDS.done })
      .build();

    // when
    const facts = parse(node);

    // then
    expect(facts.resolvedAt?.toISOString()).toBe("2026-08-05T09:00:00.000Z");
  });

  it("should reject a story point value that is not a finite number", () => {
    // given
    const node = JiraIssueBuilder.create()
      .withStoryPoints("customfield_10016", Number.NaN)
      .build();

    // when
    const facts = parse(node, "customfield_10016");

    // then
    expect(facts.storyPoints).toBeNull();
  });

  it("should ignore a status whose category the site did not report", () => {
    // given
    const statuses = [{ id: "10500", name: "Odd", statusCategory: null }, { id: "10501" }];

    // when
    const map = buildStatusCategories(statuses);

    // then
    expect(map.size).toBe(0);
  });

  it("should keep the first id when a site carries two fields of the same name", () => {
    // given
    const fields = [
      { id: "customfield_10016", name: "Story Points" },
      { id: "customfield_10099", name: "story points" },
    ];

    // when
    const resolved = resolveStoryPointsField(fields, null);

    // then
    expect(resolved).toBe("customfield_10016");
  });
});

describe("tallyContributors", () => {
  const resolved = (accountId: string) =>
    JiraIssueBuilder.create()
      .withReporter(JiraIssueBuilder.account("reporter"))
      .withAssignee(JiraIssueBuilder.account(accountId))
      .withCreated("2026-08-02T09:00:00.000Z")
      .withResolution("2026-08-04T09:00:00.000Z")
      .withTransition({
        accountId,
        at: "2026-08-03T09:00:00.000Z",
        from: STATUS_IDS.todo,
        to: STATUS_IDS.inProgress,
      })
      .build();

  it("should attribute creation to the reporter and resolution to the assignee", () => {
    // given
    // Jira records no "closed by", and both attributions are what the site's
    // own reports use — so the numbers here agree with what a team already sees.
    const issues = [parse(resolved("dev"))];

    // when
    const tallies = tallyContributors(issues, WINDOW, { storyPointsResolved: false });

    // then
    expect(tallies.get("reporter")?.issuesCreated).toBe(1);
    expect(tallies.get("dev")?.issuesResolved).toBe(1);
    expect(tallies.get("reporter")?.issuesResolved).toBe(0);
  });

  it("should measure cycle time from the start of work and lead time from creation", () => {
    // given
    const issues = [parse(resolved("dev"))];

    // when
    const tallies = tallyContributors(issues, WINDOW, { storyPointsResolved: false });

    // then
    expect(tallies.get("dev")?.cycleTime).toEqual({ totalHours: 24, issues: 1 });
    expect(tallies.get("dev")?.leadTime).toEqual({ totalHours: 48, issues: 1 });
  });

  it("should leave cycle time unmeasured for an issue that never reached the board", () => {
    // given
    // Counting it as instantaneous would drag every median towards zero and
    // make a team look faster the more work it skipped the board with.
    const node = JiraIssueBuilder.create()
      .withAssignee(JiraIssueBuilder.account("dev"))
      .withCreated("2026-08-02T09:00:00.000Z")
      .withResolution("2026-08-03T09:00:00.000Z")
      .build();

    // when
    const tallies = tallyContributors([parse(node)], WINDOW, { storyPointsResolved: false });

    // then
    expect(tallies.get("dev")?.cycleTime).toBeNull();
    expect(tallies.get("dev")?.leadTime).toEqual({ totalHours: 24, issues: 1 });
  });

  it("should ignore activity that falls outside the window", () => {
    // given
    const node = JiraIssueBuilder.create()
      .withReporter(JiraIssueBuilder.account("dev"))
      .withCreated("2026-07-01T09:00:00.000Z")
      .withComments([
        { accountId: "dev", created: "2026-08-02T09:00:00.000Z" },
        { accountId: "dev", created: "2026-07-02T09:00:00.000Z" },
      ])
      .build();

    // when
    const tallies = tallyContributors([parse(node)], WINDOW, { storyPointsResolved: false });

    // then
    expect(tallies.get("dev")?.issuesCreated).toBe(0);
    expect(tallies.get("dev")?.interactions.comments).toBe(1);
  });

  it("should charge a reopening to the assignee rather than to whoever pressed the button", () => {
    // given
    // A reopened ticket is a statement about work coming back, and the person
    // who noticed the defect is not the person it came back to.
    const node = JiraIssueBuilder.create()
      .withAssignee(JiraIssueBuilder.account("dev"))
      .withTransition({
        accountId: "tester",
        at: "2026-08-05T09:00:00.000Z",
        from: STATUS_IDS.done,
        to: STATUS_IDS.todo,
      })
      .build();

    // when
    const tallies = tallyContributors([parse(node)], WINDOW, { storyPointsResolved: false });

    // then
    expect(tallies.get("dev")?.reopened).toBe(1);
    expect(tallies.get("tester")?.reopened).toBe(0);
    expect(tallies.get("tester")?.interactions.transitions).toBe(1);
  });

  it("should report comments as unmeasured for everybody when no issue carried them", () => {
    // given
    // That is a statement about the site rather than about a person, and a zero
    // would read as a team that never discusses its work.
    const issues = [parse(JiraIssueBuilder.create().withReporter(JiraIssueBuilder.account("dev")).withCreated("2026-08-02T09:00:00.000Z").build())];

    // when
    const tallies = tallyContributors(issues, WINDOW, { storyPointsResolved: false });

    // then
    expect(tallies.get("dev")?.interactions.comments).toBeNull();
    expect(tallies.get("dev")?.interactions.worklogEntries).toBeNull();
    expect(tallies.get("dev")?.interactions.transitions).toBe(0);
  });

  it("should charge a capped issue to everyone who appears on it", () => {
    // given
    // They are exactly the people whose counts the cap might understate.
    const node = JiraIssueBuilder.create()
      .withReporter(JiraIssueBuilder.account("reporter"))
      .withAssignee(JiraIssueBuilder.account("dev"))
      .withComments([{ accountId: "dev", created: "2026-08-02T09:00:00.000Z" }], 90)
      .build();

    // when
    const tallies = tallyContributors([parse(node)], WINDOW, { storyPointsResolved: false });

    // then
    expect(tallies.get("dev")?.interactions.truncatedIssues).toBe(1);
    expect(tallies.get("reporter")?.interactions.truncatedIssues).toBe(1);
  });

  it("should total story points only when the field was resolved", () => {
    // given
    const node = JiraIssueBuilder.create()
      .withReporter(JiraIssueBuilder.account("dev"))
      .withAssignee(JiraIssueBuilder.account("dev"))
      .withCreated("2026-08-02T09:00:00.000Z")
      .withResolution("2026-08-03T09:00:00.000Z")
      .withStoryPoints("customfield_10016", 3)
      .build();

    // when
    const measured = tallyContributors([parse(node, "customfield_10016")], WINDOW, {
      storyPointsResolved: true,
    });
    const unmeasured = tallyContributors([parse(node, null)], WINDOW, {
      storyPointsResolved: false,
    });

    // then
    expect(measured.get("dev")?.storyPointsEstimated).toBe(3);
    expect(measured.get("dev")?.storyPointsCompleted).toBe(3);
    expect(unmeasured.get("dev")?.storyPointsCompleted).toBeNull();
  });

  it("should drop a reopening on an unassigned issue rather than inventing an owner", () => {
    // given
    const node = JiraIssueBuilder.create()
      .withAssignee(null)
      .withTransition({
        accountId: "tester",
        at: "2026-08-05T09:00:00.000Z",
        from: STATUS_IDS.done,
        to: STATUS_IDS.todo,
      })
      .build();

    // when
    const tallies = tallyContributors([parse(node)], WINDOW, { storyPointsResolved: false });

    // then
    expect(tallies.get("tester")?.reopened).toBe(0);
    expect(tallies.get("tester")?.interactions.transitions).toBe(1);
  });

  it("should count a resolved issue with no estimate as zero points, not as unmeasured", () => {
    // given
    // The field exists on this site, so an issue nobody estimated is a real
    // zero — unlike a site with no field at all, which reports null.
    const node = JiraIssueBuilder.create()
      .withAssignee(JiraIssueBuilder.account("dev"))
      .withCreated("2026-08-02T09:00:00.000Z")
      .withResolution("2026-08-03T09:00:00.000Z")
      .build();

    // when
    const tallies = tallyContributors([parse(node, "customfield_10016")], WINDOW, {
      storyPointsResolved: true,
    });

    // then
    expect(tallies.get("dev")?.storyPointsCompleted).toBe(0);
  });

  it("should leave lead time unmeasured for an issue resolved before it was created", () => {
    // given
    // A changelog the search truncated can put the two the wrong way round, and
    // a negative lead time is worse than no lead time.
    const node = JiraIssueBuilder.create()
      .withAssignee(JiraIssueBuilder.account("dev"))
      .withCreated("2026-08-06T09:00:00.000Z")
      .withResolution("2026-08-03T09:00:00.000Z")
      .build();

    // when
    const tallies = tallyContributors([parse(node)], WINDOW, { storyPointsResolved: false });

    // then
    expect(tallies.get("dev")?.leadTime).toBeNull();
    expect(tallies.get("dev")?.issuesResolved).toBe(1);
  });

  it("should drop an unassigned issue rather than inventing an account for it", () => {
    // given
    const node = JiraIssueBuilder.create()
      .withReporter(null)
      .withAssignee(null)
      .withCreated("2026-08-02T09:00:00.000Z")
      .withResolution("2026-08-03T09:00:00.000Z")
      .build();

    // when
    const tallies = tallyContributors([parse(node)], WINDOW, { storyPointsResolved: false });

    // then
    expect(tallies.size).toBe(0);
  });
});

describe("throughputPerWeek", () => {
  it("should express a count as a rate the two windows can be compared on", () => {
    // given
    const window = {
      from: new Date("2026-08-01T00:00:00.000Z"),
      to: new Date("2026-08-15T00:00:00.000Z"),
    };

    // when
    const rate = throughputPerWeek(14, window);

    // then
    expect(rate).toBe(7);
  });

  it("should report null rather than extrapolating from less than a day", () => {
    // given
    // "112 issues per week" because two closed inside a lunch break is
    // arithmetic, not measurement.
    const window = {
      from: new Date("2026-08-01T09:00:00.000Z"),
      to: new Date("2026-08-01T11:00:00.000Z"),
    };

    // when
    const rate = throughputPerWeek(2, window);

    // then
    expect(rate).toBeNull();
  });
});

describe("tallyRepository", () => {
  it("should report the distribution the contributor payload is not allowed to carry", () => {
    // given
    // Repository rows are never merged with one another, so percentiles stay
    // meaningful here.
    const issues = [8, 24, 72].map((hours, index) =>
      parse(
        JiraIssueBuilder.create()
          .withKey(`PLAT-${index}`)
          .withAssignee(JiraIssueBuilder.account(`dev-${index}`))
          .withType(index === 0 ? "Bug" : "Story")
          .withCreated("2026-08-01T00:00:00.000Z")
          .withResolution(new Date(Date.parse("2026-08-01T00:00:00.000Z") + hours * 3600_000).toISOString())
          .build(),
      ),
    );

    // when
    const metrics = tallyRepository(issues, SCOPE, WINDOW, {
      openIssues: 12,
      oldestOpenIssue: null,
      openByPriority: [{ name: "High", count: 3 }],
      storyPointsResolved: false,
    });

    // then
    expect(metrics).toMatchObject({
      projectKey: "PLAT",
      component: null,
      issuesResolved: 3,
      bugRatio: 33.3,
      contributors: 3,
      openIssues: 12,
      storyPointsCompleted: null,
    });
    expect(metrics.leadTime).toMatchObject({ issues: 3, medianHours: 24 });
    expect(metrics.throughputPerWeek).toBe(3);
  });

  it("should count everyone who touched the project, not only those who closed something", () => {
    // given
    const node = JiraIssueBuilder.create()
      .withReporter(JiraIssueBuilder.account("reporter"))
      .withCreated("2026-08-02T09:00:00.000Z")
      .withComments([{ accountId: "commenter", created: "2026-08-03T09:00:00.000Z" }])
      .build();

    // when
    const metrics = tallyRepository([parse(node)], SCOPE, WINDOW, {
      openIssues: null,
      oldestOpenIssue: null,
      openByPriority: [],
      storyPointsResolved: false,
    });

    // then
    expect(metrics.contributors).toBe(2);
    expect(metrics.bugRatio).toBeNull();
    expect(metrics.cycleTime).toBeNull();
  });
});

describe("toOpenIssue", () => {
  it("should age the oldest open issue against the instant the run measured", () => {
    // given
    const issue = parse(
      JiraIssueBuilder.create().withKey("PLAT-9").withCreated("2026-07-01T00:00:00.000Z").build(),
    );

    // when
    const open = toOpenIssue(issue, new Date("2026-08-08T12:00:00.000Z"));

    // then
    expect(open).toEqual({
      key: "PLAT-9",
      summary: issue.summary,
      createdAt: "2026-07-01T00:00:00.000Z",
      ageDays: 38,
    });
  });

  it("should report nothing when there is no issue or no creation date", () => {
    // given
    const undated = parse(JiraIssueBuilder.create().withCreated("").build());

    // when
    const results = [toOpenIssue(null, new Date()), toOpenIssue(undated, new Date())];

    // then
    expect(results).toEqual([null, null]);
  });
});
