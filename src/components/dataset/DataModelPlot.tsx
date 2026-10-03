import { useMemo } from "react";
import { evaluatePrediction } from "../../domain/dataset/evaluatePerExampleLoss";
import { INPUT_NAME, TARGET_NAME } from "../../domain/dataset/modelTemplates";
import type { CompiledPerExampleLoss, Dataset } from "../../domain/dataset/types";
import { pickFocusedEntry } from "../../domain/simulation/ruleRunControl";
import { canvasTransform, type CanvasTransform } from "../../domain/visualization/canvasTransform";
import { dataPlotBounds, logisticDecisionBoundary, sampleModelCurve, type CurvePoint } from "../../domain/visualization/modelCurve";
import { useRunnersVersion } from "../../hooks/useRunnersVersion";
import { useWorkspaceStore } from "../../state/workspaceStore";
import type { DatasetRuleRunnerEntry } from "../MetricCharts";

const VIEW_WIDTH = 480;
const VIEW_HEIGHT = 320;
const MARGIN = { left: 44, right: 12, top: 12, bottom: 34 };
const PLOT_WIDTH = VIEW_WIDTH - MARGIN.left - MARGIN.right;
const PLOT_HEIGHT = VIEW_HEIGHT - MARGIN.top - MARGIN.bottom;
const CURVE_SAMPLES = 120;
const POINT_RADIUS = 3;
const BATCH_POINT_RADIUS = 5;
const POINT_COLOR = "#9aa1ac";
const GHOST_COLOR = "#e8e8ec";
const MISCLASSIFIED_COLOR = "#ff8a80";
const PROBABILITY_THRESHOLD = 0.5;

function toPolyline(points: readonly CurvePoint[], t: CanvasTransform): string {
  return points.map((p) => {
    const { px, py } = t.toCanvas(p.x, p.y);
    return `${px.toFixed(1)},${py.toFixed(1)}`;
  }).join(" ");
}

function formatTick(value: number): string {
  return Math.abs(value) >= 1000 || (Math.abs(value) < 0.01 && value !== 0) ? value.toExponential(1) : value.toFixed(2);
}

interface Props {
  entries: DatasetRuleRunnerEntry[];
}

/**
 * The data side of "a point on the loss surface is a curve through the
 * data": every row as a point, each visible rule's current model drawn as a
 * curve in its color (sampled from the formula's `prediction`, so any model
 * draws), the focused rule's current mini-batch highlighted with residuals
 * from each point to the model, and a dashed ghost curve for whatever
 * parameters are under the pointer on the contour. Logistic models also
 * show the decision boundary and ring misclassified points.
 */
export function DataModelPlot({ entries }: Props) {
  useRunnersVersion(entries.map((e) => e.runner));
  const dataset = useWorkspaceStore((s) => s.dataset);
  const loss = useWorkspaceStore((s) => s.activePerExampleLoss);
  const modelKind = useWorkspaceStore((s) => s.modelKind);
  const definesPrediction = useWorkspaceStore((s) => s.modelDefinesPrediction);
  const inputColumn = useWorkspaceStore((s) => s.inputColumn);
  const targetColumn = useWorkspaceStore((s) => s.targetColumn);
  const focusedRuleId = useWorkspaceStore((s) => s.focusedRuleId);
  const hover = useWorkspaceStore((s) => s.parameterHover);

  const isLogistic = modelKind === "logistic";
  const bounds = useMemo(() => (dataset ? dataPlotBounds(dataset, isLogistic) : null), [dataset, isLogistic]);
  if (!dataset || !loss || !bounds) return <p className="dataset-placeholder">Load data and choose a model to see it here.</p>;

  const t = canvasTransform(bounds, PLOT_WIDTH, PLOT_HEIGHT);
  const curveFor = (coords: Readonly<Record<string, number>>) => sampleModelCurve(loss, coords, bounds.xMin, bounds.xMax, CURVE_SAMPLES);
  const curves = entries.filter((e) => e.rule.visible).map((e) => ({ entry: e, curve: curveFor(e.runner.current.coords) }));
  const focused = pickFocusedEntry(entries, focusedRuleId);
  const ghost = hover ? curveFor(hover) : null;
  const drawable = definesPrediction && curves.some((c) => c.curve !== null);

  return (
    <div className="data-plot">
      <svg viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} className="data-plot-svg" role="img" aria-label="Data and model">
        <defs>
          <clipPath id="data-plot-clip">
            <rect width={PLOT_WIDTH} height={PLOT_HEIGHT} />
          </clipPath>
        </defs>
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          <Axes t={t} xLabel={inputColumn ?? INPUT_NAME} yLabel={isLogistic ? `P(${targetColumn ?? TARGET_NAME} = 1)` : targetColumn ?? TARGET_NAME} bounds={bounds} />
          <g clipPath="url(#data-plot-clip)">
            {focused && isLogistic ? <DecisionBoundary coords={focused.runner.current.coords} color={focused.rule.color} t={t} /> : null}
            {curves.map(({ entry, curve }) =>
              curve ? <polyline key={entry.rule.id} points={toPolyline(curve, t)} fill="none" stroke={entry.rule.color} strokeWidth={2.5} /> : null,
            )}
            {ghost ? <polyline points={toPolyline(ghost, t)} fill="none" stroke={GHOST_COLOR} strokeWidth={1.5} strokeDasharray="5 4" opacity={0.8} /> : null}
            <DataPoints dataset={dataset} loss={loss} focused={focused} isLogistic={isLogistic} t={t} />
          </g>
        </g>
      </svg>
      {!drawable ? <p className="field-hint">The model can't be drawn: define `prediction` as a function of x (and the parameters) to see it here.</p> : null}
      {focused ? (
        <p className="field-hint data-plot-legend">
          Highlighted: the {focused.runner.current.batchRowIndices.length} rows <strong style={{ color: focused.rule.color }}>{focused.rule.name}</strong>'s next step learns from.
        </p>
      ) : null}
    </div>
  );
}

function Axes({ t, xLabel, yLabel, bounds }: { t: CanvasTransform; xLabel: string; yLabel: string; bounds: { xMin: number; xMax: number; yMin: number; yMax: number } }) {
  return (
    <g className="data-plot-axes">
      <rect width={PLOT_WIDTH} height={PLOT_HEIGHT} fill="none" stroke="#2c3038" />
      <text x={4} y={PLOT_HEIGHT + 14} textAnchor="start">{formatTick(bounds.xMin)}</text>
      <text x={PLOT_WIDTH} y={PLOT_HEIGHT + 14} textAnchor="end">{formatTick(bounds.xMax)}</text>
      <text x={PLOT_WIDTH / 2} y={PLOT_HEIGHT + 28} textAnchor="middle" className="data-plot-axis-label">{xLabel}</text>
      <text x={-6} y={t.toCanvas(bounds.xMin, bounds.yMax).py + 10} textAnchor="end">{formatTick(bounds.yMax)}</text>
      <text x={-6} y={PLOT_HEIGHT} textAnchor="end">{formatTick(bounds.yMin)}</text>
      <text transform={`translate(${-32},${PLOT_HEIGHT / 2}) rotate(-90)`} textAnchor="middle" className="data-plot-axis-label">{yLabel}</text>
    </g>
  );
}

function DecisionBoundary({ coords, color, t }: { coords: Readonly<Record<string, number>>; color: string; t: CanvasTransform }) {
  const boundary = logisticDecisionBoundary(coords);
  if (boundary === null) return null;
  const { px } = t.toCanvas(boundary, 0);
  return <line x1={px} x2={px} y1={0} y2={PLOT_HEIGHT} stroke={color} strokeDasharray="6 4" strokeWidth={1.5} opacity={0.9} />;
}

interface DataPointsProps {
  dataset: Dataset;
  loss: CompiledPerExampleLoss;
  focused: DatasetRuleRunnerEntry | null;
  isLogistic: boolean;
  t: CanvasTransform;
}

/** Every row; the focused rule's batch rows enlarged with a residual line to the model; logistic misclassifications ringed. */
function DataPoints({ dataset, loss, focused, isLogistic, t }: DataPointsProps) {
  const coords = focused?.runner.current.coords ?? null;
  const batch = new Set(focused?.runner.current.batchRowIndices ?? []);
  const predict = (row: Record<string, number>) => (coords ? evaluatePrediction(loss, coords, row) : null);

  return (
    <>
      {dataset.rows.map((row, i) => {
        const { px, py } = t.toCanvas(row[INPUT_NAME], row[TARGET_NAME]);
        const prediction = predict(row);
        const inBatch = batch.has(i);
        const misclassified = isLogistic && prediction !== null && prediction >= PROBABILITY_THRESHOLD !== (row[TARGET_NAME] === 1);
        const residual = inBatch && prediction !== null && Number.isFinite(prediction) ? t.toCanvas(row[INPUT_NAME], prediction) : null;
        return (
          <g key={i}>
            {residual ? <line x1={px} y1={py} x2={residual.px} y2={residual.py} stroke={focused!.rule.color} strokeWidth={1} opacity={0.7} /> : null}
            {misclassified ? <circle cx={px} cy={py} r={BATCH_POINT_RADIUS + 2} fill="none" stroke={MISCLASSIFIED_COLOR} strokeWidth={1} /> : null}
            <circle
              cx={px}
              cy={py}
              r={inBatch ? BATCH_POINT_RADIUS : POINT_RADIUS}
              fill={inBatch ? focused!.rule.color : POINT_COLOR}
              opacity={inBatch ? 1 : 0.65}
            />
          </g>
        );
      })}
    </>
  );
}
