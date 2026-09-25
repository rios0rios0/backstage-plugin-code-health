import { InfoCard } from "@backstage/core-components";
import Grid from "@material-ui/core/Grid";
import Typography from "@material-ui/core/Typography";
import {
  claudeRatesOf, claudeTokenTotal, claudeWindowDays, formatCount, formatRate,
  RATE_PERIODS,
  type ContributorSummary, type TimeWindow,
} from "@rios0rios0/backstage-plugin-code-health-common";
import { claudeUsageOf, claudeUsageRanking } from "../../../domain/entities/claude_insights";
import { RankingChart } from "../charts/ranking_chart";
import { StatTile } from "../charts/stat_tile";
import { usePersonLink } from "./detail_links";

export const ClaudeUsageInsights = ({ contributors, window, fleetDailyTokens }: {
  readonly contributors: readonly ContributorSummary[];
  readonly window: TimeWindow;
  readonly fleetDailyTokens?: number | null;
}) => {
  const { metrics, people } = claudeUsageOf(contributors);
  const rates = metrics === null ? null : claudeRatesOf(metrics, claudeWindowDays(window));
  const figures = [
    ["Total tokens", metrics === null ? null : claudeTokenTotal(metrics)],
    ["Input tokens", metrics?.inputTokens ?? null],
    ["Output tokens", metrics?.outputTokens ?? null],
    ["Cache read tokens", metrics?.cacheReadTokens ?? null],
    ["Cache creation tokens", metrics?.cacheCreationTokens ?? null],
    ["Per day", rates?.daily ?? null],
    ["Per week", rates?.weekly ?? null],
    ["Per month", rates?.monthly ?? null],
  ] as const;
  return (<Grid item xs={12}>
    <InfoCard title="Claude Code usage" subheader="Informational — excluded from productivity scores">
      <Grid container spacing={3}>
        {figures.map(([label, value]) => (<Grid item xs={6} md={3} key={label}>
          <StatTile label={label} value={value === null ? "—" : formatRate(value)} />
        </Grid>))}
      </Grid>
      {fleetDailyTokens === undefined || fleetDailyTokens === null ? null : (
        <Typography variant="body2" component="p">
          Team average per measured person: {formatRate(fleetDailyTokens)} tokens/day;
          {` ${formatRate(fleetDailyTokens * RATE_PERIODS.weekly.days)} tokens/week;`}
          {` ${formatRate(fleetDailyTokens * RATE_PERIODS.monthly.days)} tokens/month.`}
        </Typography>
      )}
      <Typography variant="caption" color="textSecondary" component="p">
        {formatCount(people)} measured accounts or linked people. Totals include cache tokens.
        Daily reports cover the UTC dates touched by the range, not individual hours; today may be delayed or incomplete.
        Averages divide collected tokens by all UTC dates in the range; weeks use 7 days and months use 365.25/12 days.
        Missing reports can lower these averages. An empty value means no usage report was collected for this selection.
        Token volume measures consumption, not work quality.
      </Typography>
    </InfoCard>
  </Grid>);
};

export const ClaudeContributorInsights = ({ contributors }: { readonly contributors: readonly ContributorSummary[] }) => {
  const linkToPerson = usePersonLink();
  return (<Grid item xs={12} md={6}>
    <InfoCard title="Claude token usage by person" subheader="Consumption, including cache tokens; excluded from productivity scores">
      <RankingChart items={claudeUsageRanking(contributors)} unit="tokens" formatValue={formatCount} linkTo={linkToPerson} showAvatars
        emptyMessage="No Claude usage reports have been collected for this window." />
    </InfoCard>
  </Grid>);
};
