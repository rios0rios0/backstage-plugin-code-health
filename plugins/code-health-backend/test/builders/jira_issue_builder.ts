import type {
  JiraChangeEntry,
  JiraIssueNode,
  JiraUserNode,
} from "../../src/infrastructure/services/atlassian/jira_queries";

let counter = 0;

/**
 * Builds a Jira search hit the way the API returns one.
 *
 * The shape matters more here than in most builders: almost every mistake this
 * plugin can make about Jira is a mistake about the *response* — a changelog
 * item naming a status id rather than a category, a comment container that is
 * present but capped, a custom field carrying its number as a string — so the
 * builder produces the real envelope and the tests deliberately reach for its
 * awkward corners.
 */
export class JiraIssueBuilder {
  private node: JiraIssueNode;

  constructor() {
    counter += 1;
    this.node = {
      key: `PLAT-${counter}`,
      fields: {
        summary: `issue ${counter}`,
        created: "2026-08-01T09:00:00.000+0000",
        resolutiondate: null,
        issuetype: { name: "Task", subtask: false },
        status: { id: "10000" },
        priority: { name: "Medium" },
        reporter: null,
        assignee: null,
      },
    };
  }

  static create(): JiraIssueBuilder {
    return new JiraIssueBuilder();
  }

  /** Jira's own user shape: an accountId, and an e-mail only sometimes. */
  static account(
    accountId: string,
    overrides: Partial<JiraUserNode> = {},
  ): JiraUserNode {
    return {
      accountId,
      displayName: `User ${accountId}`,
      avatarUrls: { "48x48": `https://avatar.example/${accountId}` },
      ...overrides,
    };
  }

  private withFields(fields: Record<string, unknown>): this {
    this.node = { ...this.node, fields: { ...this.node.fields, ...fields } };
    return this;
  }

  withKey(key: string): this {
    this.node = { ...this.node, key };
    return this;
  }

  withoutKey(): this {
    const { key: _dropped, ...rest } = this.node;
    this.node = rest;
    return this;
  }

  withType(name: string, subtask = false): this {
    return this.withFields({ issuetype: { name, subtask } });
  }

  withPriority(name: string | null): this {
    return this.withFields({ priority: name === null ? null : { name } });
  }

  withCreated(instant: string): this {
    return this.withFields({ created: instant });
  }

  withReporter(user: JiraUserNode | null): this {
    return this.withFields({ reporter: user });
  }

  withAssignee(user: JiraUserNode | null): this {
    return this.withFields({ assignee: user });
  }

  withResolution(instant: string | null): this {
    return this.withFields({ resolutiondate: instant });
  }

  withStoryPoints(field: string, points: number | string | null): this {
    return this.withFields({ [field]: points });
  }

  /**
   * A comment container as the search returns it, with the total it claims.
   *
   * `total` above the number of entries is how the enhanced search reports that
   * it capped the list, and is the only signal the counts are floors.
   */
  withComments(
    comments: readonly { accountId: string; created: string }[],
    total = comments.length,
  ): this {
    return this.withFields({
      comment: {
        total,
        maxResults: comments.length,
        comments: comments.map((comment) => ({
          author: JiraIssueBuilder.account(comment.accountId),
          created: comment.created,
        })),
      },
    });
  }

  withWorklog(
    entries: readonly { accountId: string; started: string }[],
    total = entries.length,
  ): this {
    return this.withFields({
      worklog: {
        total,
        maxResults: entries.length,
        worklogs: entries.map((entry) => ({
          author: JiraIssueBuilder.account(entry.accountId),
          started: entry.started,
        })),
      },
    });
  }

  /** A status change, expressed the way the changelog does: by status id. */
  withTransition(input: {
    accountId: string | null;
    at: string;
    from?: string | null;
    to?: string | null;
  }): this {
    const entry: JiraChangeEntry = {
      author: input.accountId === null ? null : JiraIssueBuilder.account(input.accountId),
      created: input.at,
      items: [
        {
          field: "status",
          fieldId: "status",
          from: input.from ?? null,
          to: input.to ?? null,
        },
      ],
    };

    const changelog = this.node.changelog ?? null;
    this.node = {
      ...this.node,
      changelog: {
        total: (changelog?.total ?? 0) + 1,
        maxResults: (changelog?.maxResults ?? 0) + 1,
        histories: [...(changelog?.histories ?? []), entry],
      },
    };
    return this;
  }

  /** A change to something other than status, which must be ignored. */
  withFieldChange(input: { accountId: string; at: string; field: string }): this {
    const changelog = this.node.changelog ?? null;
    this.node = {
      ...this.node,
      changelog: {
        total: (changelog?.total ?? 0) + 1,
        maxResults: (changelog?.maxResults ?? 0) + 1,
        histories: [
          ...(changelog?.histories ?? []),
          {
            author: JiraIssueBuilder.account(input.accountId),
            created: input.at,
            items: [{ field: input.field, fieldId: input.field, from: "a", to: "b" }],
          },
        ],
      },
    };
    return this;
  }

  /** A changelog the search capped, so its transitions are incomplete. */
  withTruncatedChangelog(total: number): this {
    this.node = {
      ...this.node,
      changelog: { ...this.node.changelog, total, maxResults: 100 },
    };
    return this;
  }

  build(): JiraIssueNode {
    return this.node;
  }
}

/** The status ids the builder's transitions use, and their Jira categories. */
export const STATUS_IDS = {
  todo: "10000",
  inProgress: "10001",
  done: "10002",
} as const;

export const statusDescriptors = () => [
  { id: STATUS_IDS.todo, name: "To Do", statusCategory: { key: "new" } },
  { id: STATUS_IDS.inProgress, name: "In Progress", statusCategory: { key: "indeterminate" } },
  { id: STATUS_IDS.done, name: "Done", statusCategory: { key: "done" } },
];
