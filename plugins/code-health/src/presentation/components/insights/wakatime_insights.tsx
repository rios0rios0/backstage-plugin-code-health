import { InfoCard } from "@backstage/core-components";
import Box from "@material-ui/core/Box";
import Divider from "@material-ui/core/Divider";
import Grid from "@material-ui/core/Grid";
import Typography from "@material-ui/core/Typography";
import type {
  ContributorSummary,
  RepositorySummary,
} from "@rios0rios0/backstage-plugin-code-health-common";
import { formatDuration, formatTokens } from "@rios0rios0/backstage-plugin-code-health-common";
import { useMemo } from "react";
import {
  categoryBreakdown,
  codingTimeSeries,
  editorBreakdown,
  formatOptionalDuration,
  languageBreakdown,
  topContributorsByCodingTime,
  topRepositoriesByCodingTime,
  wakaTimeKpis,
} from "../../../domain/entities/wakatime_insights";
import { RankingChart } from "../charts/ranking_chart";
import { StatTile } from "../charts/stat_tile";

export interface WakaTimeInsightsProps {
  readonly repositories: readonly RepositorySummary[];
  readonly contributors: readonly ContributorSummary[];
}

/**
 * Where the fleet's attention actually went.
 *
 * The one section here that measures effort rather than output. Everything else
 * on the Insights tab counts things a version control provider produced — a
 * commit, a merged pull request, a green pipeline — and none of them can see
 * the afternoon somebody spent reading code that produced no commit at all.
 *
 * Rendered as `<Grid item>` children so the Insights page composes it into the
 * same grid as its own cards, and so a fleet with no WakaTime is a section that
 * is never built rather than one full of empty cards.
 */
export const WakaTimeInsights = ({ repositories, contributors }: WakaTimeInsightsProps) => {
  const kpis = useMemo(() => wakaTimeKpis(contributors), [contributors]);
  const languages = useMemo(() => languageBreakdown(contributors), [contributors]);
  const editors = useMemo(() => editorBreakdown(contributors), [contributors]);
  const categories = useMemo(() => categoryBreakdown(contributors), [contributors]);
  const people = useMemo(() => topContributorsByCodingTime(contributors), [contributors]);
  const projects = useMemo(() => topRepositoriesByCodingTime(repositories), [repositories]);
  const trend = useMemo(() => codingTimeSeries(contributors), [contributors]);

  const busiestDay = useMemo(
    () =>
      trend.reduce<{ day: string; totalSeconds: number } | null>(
        (best, point) =>
          best === null || point.totalSeconds > best.totalSeconds ? point : best,
        null,
      ),
    [trend],
  );

  return (
    <>
      <Grid item xs={12}>
        <InfoCard
          title="Where the time went"
          subheader="Measured in the editor by WakaTime, which sees the work a commit never records"
        >
          <Grid container spacing={3}>
            <Grid item xs={6} sm={4} md={2}>
              <StatTile
                label="Coding time"
                value={formatDuration(kpis.totalSeconds)}
                caption="across the fleet"
                help="Total time WakaTime recorded in an editor inside the window, summed over everybody who has it installed."
              />
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <StatTile
                label="Per person"
                value={formatOptionalDuration(kpis.averageSecondsPerContributor)}
                caption={`${kpis.measuredContributors} measured`}
                help="Mean across the people who logged any time at all. Dividing by everybody who committed would make the figure fall whenever somebody without WakaTime installed pushes a commit, which says nothing about how the team works."
              />
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <StatTile
                label="Top language"
                value={kpis.topLanguage?.name ?? "—"}
                caption={
                  kpis.topLanguage === null ? undefined : `${kpis.topLanguage.percent}% of the time`
                }
              />
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <StatTile
                label="Top editor"
                value={kpis.topEditor?.name ?? "—"}
                caption={
                  kpis.topEditor === null ? undefined : `${kpis.topEditor.percent}% of the time`
                }
              />
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <StatTile
                label="AI-written lines"
                value={kpis.aiAuthorshipPercent === null ? "—" : `${kpis.aiAuthorshipPercent}%`}
                caption="of lines added"
                help="Share of the lines added in an editor that WakaTime attributed to AI rather than to typing. Empty means the AI figures were never collected — set `codeHealth.wakaTime.includeAiMetrics` to start — not that nobody used AI."
              />
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <StatTile
                label="AI tokens"
                value={kpis.aiTokens === null ? "—" : formatTokens(kpis.aiTokens)}
                caption="prompt and completion"
                help="The only token count any system here can see. No version control provider knows whether a line was typed or accepted from a completion; WakaTime's editor plugins do."
              />
            </Grid>
          </Grid>

          {busiestDay === null ? null : (
            <>
              <Box my={2}>
                <Divider />
              </Box>
              <Typography variant="caption" color="textSecondary">
                Busiest day: {busiestDay.day} with {formatDuration(busiestDay.totalSeconds)} logged.
              </Typography>
            </>
          )}
        </InfoCard>
      </Grid>

      <Grid item xs={12} md={6}>
        <InfoCard
          title="What the time went into"
          subheader="Coding, reviewing, debugging and writing tests, as the editor saw them"
        >
          <RankingChart
            items={categories}
            unit="of coding time"
            formatValue={formatDuration}
            emptyMessage="WakaTime reported no category breakdown for this window. Not every plan returns one."
          />
          <Box my={2}>
            <Divider />
          </Box>
          <Box mb={1} fontWeight={500}>
            Languages
          </Box>
          <RankingChart
            items={languages}
            unit="of coding time"
            formatValue={formatDuration}
            emptyMessage="No coding time was recorded in this window."
          />
        </InfoCard>
      </Grid>

      <Grid item xs={12} md={6}>
        <InfoCard
          title="Who spent the time"
          subheader="Hours in an editor, which is a different ranking from commits"
        >
          <RankingChart
            items={people}
            unit="of coding time"
            showAvatars
            formatValue={formatDuration}
            emptyMessage="Nobody logged any coding time in this window."
          />
          <Box my={2}>
            <Divider />
          </Box>
          <Box mb={1} fontWeight={500}>
            Editors
          </Box>
          <RankingChart
            items={editors}
            unit="of coding time"
            formatValue={formatDuration}
            emptyMessage="No coding time was recorded in this window."
          />
        </InfoCard>
      </Grid>

      <Grid item xs={12}>
        <InfoCard
          title="Where the time went, by repository"
          subheader="Matched to the WakaTime project by name, or by the `wakatime.com/project` annotation"
        >
          <RankingChart
            items={projects}
            unit="of coding time"
            formatValue={formatDuration}
            emptyMessage="No repository matched a WakaTime project in this window. Add a `wakatime.com/project` annotation to a catalog entity whose project is named differently."
          />
        </InfoCard>
      </Grid>
    </>
  );
};
