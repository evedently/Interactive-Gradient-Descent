import { buildPolylinePoints, computeValueDomain } from "../domain/visualization/lineChart";
import type { PrimaryVariable } from "../domain/rules/ruleCompiler";
import type { DatasetSimulationRunner } from "../domain/simulation/DatasetSimulationRunner";
import type { DatasetTrajectoryPoint } from "../domain/simulation/DatasetTypes";
import { useRunnersVersion } from "../hooks/useRunnersVersion";
import type { RuleEntry } from "../hooks/useRuleEntries";

const CHART_WIDTH = 320;
const CHART_HEIGHT = 110;

export type DatasetRuleRunnerEntry = RuleEntry<DatasetSimulationRunner>;

interface ChartProps {
  title: string;
  entries: DatasetRuleRunnerEntry[];
  extract: (point: DatasetTrajectoryPoint) => number;
}

function Chart({ title, entries, extract }: ChartProps) {
  const visible = entries.filter((e) => e.rule.visible);
  const domain = computeValueDomain(visible.flatMap((e) => e.runner.trajectory.map(extract)));

  return (
    <div className="metric-chart">
      <div className="metric-chart-title">{title}</div>
      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="metric-chart-svg" preserveAspectRatio="none">
        {visible.map((e) => (
          <polyline
            key={e.rule.id}
            points={buildPolylinePoints(e.runner.trajectory.map(extract), domain, CHART_WIDTH, CHART_HEIGHT)}
            fill="none"
            stroke={e.rule.color}
            strokeWidth={2}
          />
        ))}
      </svg>
      <div className="metric-chart-range">
        {domain.min.toFixed(4)} to {domain.max.toFixed(4)}
      </div>
    </div>
  );
}

interface Props {
  entries: DatasetRuleRunnerEntry[];
  primaryVariables: readonly PrimaryVariable[];
}

/**
 * Dataset mode's per-primary-variable and loss-vs-iteration plots (DESIGN.md
 * §7/§13). Batch loss and full-dataset loss are charted separately and
 * deliberately never merged into one line: batch loss changes with
 * whichever mini-batch happened to be sampled that step, while full loss
 * is the same "how good is the model right now" question the 3D surface's
 * trajectory height answers (DESIGN.md §18 Phase 7 extension) — collapsing
 * them would hide exactly the batch-noise-vs-true-progress distinction
 * these two metrics exist to show.
 *
 * When there are exactly two primary variables, `DatasetWorkspaceView`
 * renders these alongside the 3D loss surface/contour (not instead of);
 * for any other count (a loss surface can't be drawn), these are the
 * whole picture, same as before this extension.
 */
export function MetricCharts({ entries, primaryVariables }: Props) {
  useRunnersVersion(entries.map((e) => e.runner));
  if (entries.length === 0) return null;

  return (
    <div className="metric-charts">
      <Chart title="Batch loss vs. iteration" entries={entries} extract={(p) => p.batchLoss} />
      <Chart title="Full-dataset loss vs. iteration" entries={entries} extract={(p) => p.fullLoss} />
      {primaryVariables.map((v) => (
        <Chart key={v.name} title={`${v.name} vs. iteration`} entries={entries} extract={(p) => p.coords[v.name]} />
      ))}
    </div>
  );
}
