import { InfoCard } from "@backstage/core-components";
import Box from "@material-ui/core/Box";
import Grid from "@material-ui/core/Grid";
import Typography from "@material-ui/core/Typography";
import type {
  ContributorSummary,
  RepositorySummary,
} from "@rios0rios0/backstage-plugin-code-health-common";
import { formatHours } from "@rios0rios0/backstage-plugin-code-health-common";
import { useMemo } from "react";
import {
  hasJiraMetrics,
  jiraFleetStats,
  jiraFlowBreakdown,
  jiraOpenPriorityRanking,
  jiraResolvedByType,
  staleJiraBacklog,
  topJiraContributorsByInteractions,
  topJiraContributorsByResolved,
} from "../../../domain/entities/jira_insights";
import { GapList } from "../charts/gap_list";
import { RankingChart } from "../charts/ranking_chart";
import { StatTile } from "../charts/stat_tile";
import { StatusBreakdown } from "../charts/status_breakdown";

export interface JiraInsightsProps {
  readonly repositories: readonly RepositorySummary[];
  readonly contributors: readonly ContributorSummary[];
}

const formatCount = (value: number): string => value.toLocaleString();
const formatOptional = (value: number | null): string =>
  value === null ? "—" : value.toLocaleString();
const formatPercent = (value: number | null): string =>
  value === null ? "—" : `${value}%`;
const formatDuration = (value: number | null): string =>
  value === null ? "—" : formatHours(value);

/**
 * The Jira half of the Insights tab.
 *
 * Rendered as loose `Grid item` children rather than as one card, so it drops
 * into the existing grid beside the version control cards instead of building a
 * second page inside the first. It is mounted only when the backend reports the
 * Jira capability, which is why nothing here checks configuration: a switched
 * off integration never reaches this component at all.
 *
 * When Jira is on but nothing has been measured yet — no entity carries a
 * `jira/project-key`, or the first snapshot has not run — it says so once
 * rather than drawing six cards of em dashes. A page of blanks looks broken;
 * a sentence explaining which of two things is missing is something somebody
 * can act on.
 */
export const JiraInsights = ({ repositories, contributors }: JiraInsightsProps) => {
  const measured = hasJiraMetrics(repositories, contributors);

  const stats = useMemo(
    () => jiraFleetStats(repositories, contributors),
    [repositories, contributors],
  );
  const closers = useMemo(
    () => topJiraContributorsByResolved(contributors),
    [contributors],
  );
  const active = useMemo(
    () => topJiraContributorsByInteractions(contributors),
    [contributors],
  );
  const flow = useMemo(() => jiraFlowBreakdown(repositories), [repositories]);
  const priorities = useMemo(() => jiraOpenPriorityRanking(repositories), [repositories]);
  const stale = useMemo(() => staleJiraBacklog(repositories), [repositories]);
  const byType = useMemo(() => jiraResolvedByType(repositories), [repositories]);

  if (!measured) {
    return (
      <Grid item xs={12}>
        <InfoCard title="Jira">
          <Typography variant="body2" color="textSecondary">
            Jira is configured, but nothing has been measured yet. Repositories are
            scoped to a project by a <code>jira/project-key</code> annotation on their
            catalog entity, and the figures fill in after the next daily snapshot.
          </Typography>
        </InfoCard>
      </Grid>
    );
  }

  return (
    <>
      <Grid item xs={12}>
        <InfoCard
          title="Jira delivery"
          subheader={`Across ${formatCount(stats.projects)} ${
            stats.projects === 1 ? "project" : "projects"
          } named by ${formatCount(stats.repositories)} ${
            stats.repositories === 1 ? "repository" : "repositories"
          }.`}
        >
          <Grid container spacing={3}>
            <Grid item xs={6} sm={4} md={2}>
              <StatTile
                label="Closed"
                value={formatCount(stats.issuesResolved)}
                caption={`${formatCount(stats.issuesCreated)} raised`}
                help="Tickets that reached a done status inside the window. A project named by several repositories is counted once, not once per repository."
              />
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <StatTile
                label="Throughput"
                value={formatOptional(stats.throughputPerWeek)}
                caption="tickets per week"
                help="Closed tickets per week, summed across the projects. Reported as a rate so windows of different lengths can be compared at all."
              />
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <StatTile
                label="Cycle time"
                value={formatDuration(stats.meanCycleHours)}
                caption="start of work to done"
                help="The mean across every measured ticket, not a median. Each project reports its own median, but medians cannot be combined — no arithmetic recovers the fleet's median from a list of them — while the totals behind them add up exactly. The per-repository column shows that project's median."
              />
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <StatTile
                label="Lead time"
                value={formatDuration(stats.meanLeadHours)}
                caption="raised to done"
                help="The same mean, measured from when the ticket was created. The gap between this and cycle time is how long work waits before anybody starts it."
              />
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <StatTile
                label="Bug ratio"
                value={formatPercent(stats.bugRatio)}
                caption={`${formatCount(byType.counts.bug)} of ${formatCount(byType.total)} closed`}
                help="The share of closed work that was a defect. Matched on Jira's default type names, so a site that invented its own defect type counts as other work."
              />
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <StatTile
                label="Open"
                value={formatOptional(stats.openIssues)}
                caption={`${formatCount(stats.reopened)} reopened in window`}
                help="Tickets not in a done status right now, across every measured project. Deliberately not scoped to the window — a backlog is a present-tense fact."
              />
            </Grid>
          </Grid>
        </InfoCard>
      </Grid>

      <Grid item xs={12} md={6}>
        <InfoCard
          title="Who closes tickets"
          subheader="By tickets resolved in the window"
        >
          <RankingChart
            items={closers}
            unit="tickets"
            showAvatars
            emptyMessage="No tickets were closed in this window."
          />
        </InfoCard>
      </Grid>

      <Grid item xs={12} md={6}>
        <InfoCard
          title="Who keeps the board moving"
          subheader="Comments, worklog and transitions — the work that closes nothing"
        >
          <RankingChart
            items={active}
            unit="interactions"
            showAvatars
            emptyMessage="No Jira activity was recorded in this window."
          />
        </InfoCard>
      </Grid>

      <Grid item xs={12} md={6}>
        <InfoCard
          title="Backlog flow"
          subheader="Whether each project is closing as much as it takes on"
        >
          <StatusBreakdown slices={flow} />
        </InfoCard>
      </Grid>

      <Grid item xs={12} md={6}>
        <InfoCard
          title="Open work by priority"
          subheader="In the site's own severity order, highest first"
        >
          {priorities.length === 0 ? (
            <Box py={2}>
              <Typography variant="body2" color="textSecondary">
                No priority breakdown was collected. It is the first thing a run gives
                up when its request allowance is running low, and a site with more
                priorities than a chart can carry is skipped outright.
              </Typography>
            </Box>
          ) : (
            <RankingChart
              items={priorities}
              unit="open tickets"
              emptyMessage="Nothing is open."
            />
          )}
        </InfoCard>
      </Grid>

      <Grid item xs={12}>
        <InfoCard
          title="Oldest open work"
          subheader="The ticket that has been waiting longest in each project"
        >
          <GapList
            gaps={stale}
            emptyMessage="Nothing is open, or no backlog was measured."
          />
        </InfoCard>
      </Grid>
    </>
  );
};
