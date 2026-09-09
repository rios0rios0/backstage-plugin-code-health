import type {
  ConfluenceContributorMetrics,
  JiraContributorMetrics,
} from "@rios0rios0/backstage-plugin-code-health-common";
import { EMPTY_JIRA_ISSUE_TYPES } from "@rios0rios0/backstage-plugin-code-health-common";

const WINDOW = { from: "2026-08-09", to: "2026-08-10" };

/**
 * The one-day Jira measurement the store actually holds.
 *
 * Jira's enricher fetches a window's issues once and slices them arithmetically,
 * so a per-day row costs nothing and is what a window is assembled from.
 */
export const aJiraContributorMetrics = (
  overrides: Partial<JiraContributorMetrics> = {},
): JiraContributorMetrics => ({
  window: WINDOW,
  issuesCreated: 0,
  issuesResolved: 0,
  interactions: { comments: null, worklogEntries: null, transitions: 0, truncatedIssues: 0 },
  storyPointsEstimated: null,
  storyPointsCompleted: null,
  cycleTime: null,
  leadTime: null,
  resolvedByType: EMPTY_JIRA_ISSUE_TYPES,
  reopened: 0,
  ...overrides,
});

/**
 * The trailing-window Confluence measurement the store holds.
 *
 * Unlike Jira's, it is not per day: measuring written volume walks a page's
 * version bodies, and doing that per day would multiply the walks by the length
 * of the window.
 */
export const aConfluenceContributorMetrics = (
  overrides: Partial<ConfluenceContributorMetrics> = {},
): ConfluenceContributorMetrics => ({
  window: WINDOW,
  pagesCreated: 0,
  pagesEdited: 0,
  pageVersionsAuthored: 0,
  blogPostsCreated: 0,
  commentsWritten: 0,
  attachmentsAdded: 0,
  spaceKeys: [],
  wordsAdded: null,
  wordsRemoved: null,
  volumeUnit: "words",
  pagesMeasuredForVolume: 0,
  pageViews: null,
  pagesMeasuredForViews: 0,
  analytics: "unavailable",
  ...overrides,
});
