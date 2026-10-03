import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import { computeFullDatasetLoss } from "../domain/dataset/evaluatePerExampleLoss";
import type { DatasetLossGrid } from "../domain/dataset/datasetLossGrid";
import type { CompiledPerExampleLoss, Dataset } from "../domain/dataset/types";
import type { PrimaryVariable } from "../domain/rules/ruleCompiler";
import { decimateForDisplay, MAX_RENDERED_TRAJECTORY_POINTS } from "../domain/visualization/decimate";
import { buildGeometryInView, normalizeHeight, surfaceViewTransformFor, type SurfaceViewTransform } from "../domain/visualization/surfaceGeometry";
import { useRunnersVersion } from "../hooks/useRunnersVersion";
import { clamp } from "../lib/math";
import { useWorkspaceStore } from "../state/workspaceStore";
import type { DatasetRuleRunnerEntry } from "./MetricCharts";
import { DRAG_PLANE_SIZE, DragCatchPlane, MARKER_LIFT, RuleOverlayMarks, SCENE_CAMERA, StartMarker, SurfaceBackdrop, TRAJECTORY_LIFT } from "./surface3d/SceneParts";
import { useMarkerDrag } from "./surface3d/useMarkerDrag";

/**
 * One visible rule's overlay. The trajectory's HEIGHT uses `fullLoss` — the
 * mean loss over the whole dataset, self-consistent with the surface's own
 * height at any (a, b) — never `batchLoss`, which is only a mini-batch
 * estimate and would make the marker sit off the surface it's supposedly
 * standing on (DESIGN.md §18 Phase 7's "trajectory's height should use
 * full-dataset loss"). Parameter values are mapped through `view` into the
 * scene's fixed visual footprint, same as surface mode.
 */
function RuleOverlay({
  entry,
  min,
  span,
  aName,
  bName,
  view,
}: {
  entry: DatasetRuleRunnerEntry;
  min: number;
  span: number;
  aName: string;
  bName: string;
  view: SurfaceViewTransform;
}) {
  const { rule, runner } = entry;
  const current = runner.current;
  const peek = runner.peekUpdate();
  const trajectory = useMemo(
    () =>
      decimateForDisplay(runner.trajectory, MAX_RENDERED_TRAJECTORY_POINTS).map(
        (p) =>
          new THREE.Vector3(view.toVisualX(p.coords[aName]), normalizeHeight(p.fullLoss, min, span) + TRAJECTORY_LIFT, view.toVisualZ(p.coords[bName])),
      ),
    [runner, min, span, aName, bName, view],
  );
  const currentVisual = new THREE.Vector3(
    view.toVisualX(current.coords[aName]),
    normalizeHeight(current.fullLoss, min, span) + MARKER_LIFT,
    view.toVisualZ(current.coords[bName]),
  );
  // A delta, not a position — scaled, never re-centered.
  const update = peek.ok
    ? new THREE.Vector3((peek.newCoords[aName] - current.coords[aName]) * view.scaleX, 0, (peek.newCoords[bName] - current.coords[bName]) * view.scaleZ)
    : null;

  return <RuleOverlayMarks color={rule.color} current={currentVisual} trajectory={trajectory} update={update} />;
}

interface Props {
  entries: DatasetRuleRunnerEntry[];
  grid: DatasetLossGrid;
  primaryVariables: readonly PrimaryVariable[];
  dataset: Dataset;
  perExampleLoss: CompiledPerExampleLoss;
  initialValues: Readonly<Record<string, number>>;
}

/**
 * Dataset mode's 3D loss surface (DESIGN.md §18 Phase 7 extension): the
 * FULL-dataset loss evaluated over a grid of the workspace's two primary
 * variables, with every visible rule's trajectory overlaid on it. Only
 * ever rendered by the caller when there are exactly two primary
 * variables (`DatasetWorkspaceView` falls back to metric plots otherwise)
 * — a loss surface over more than two dimensions can't be drawn.
 *
 * The initial-values marker is draggable here, same as surface mode's
 * start point (DESIGN.md §9) — now that a spatial view exists for dataset
 * mode, there's a natural place to set it visually instead of only
 * through the numeric inputs. Dragging pauses every running rule and
 * commits to `datasetInitialValues` on release; it never touches a rule's
 * live trajectory (only its *next* Reset seeds from it).
 */
export function DatasetSurface3D({ entries, grid, primaryVariables, dataset, perExampleLoss, initialValues }: Props) {
  useRunnersVersion(entries.map((e) => e.runner));
  const [aName, bName] = primaryVariables.map((v) => v.name);
  const setDatasetInitialValues = useWorkspaceStore((s) => s.setDatasetInitialValues);
  const view = useMemo(() => surfaceViewTransformFor(grid.bounds), [grid.bounds]);
  const { geometry, min, span } = useMemo(() => buildGeometryInView(grid, view), [grid, view]);
  const { draggingRef, controlsRef, dragPreview, setDragPreview, beginDrag } = useMarkerDrag<{ a: number; b: number }>((preview) =>
    setDatasetInitialValues({ [aName]: preview.a, [bName]: preview.b }),
  );

  const markerPoint = dragPreview ?? { a: initialValues[aName] ?? 0, b: initialValues[bName] ?? 0 };
  const markerLoss = computeFullDatasetLoss(perExampleLoss, dataset, { [aName]: markerPoint.a, [bName]: markerPoint.b });
  const markerHeight = normalizeHeight(markerLoss, min, span);

  return (
    <div className="surface3d-container">
      <div className="view-controls">
        <button onClick={() => controlsRef.current?.reset()}>Reset view</button>
      </div>
      <Canvas camera={SCENE_CAMERA}>
        <SurfaceBackdrop geometry={geometry} />

        <DragCatchPlane
          draggingRef={draggingRef}
          size={DRAG_PLANE_SIZE}
          onDragMove={(visualX, visualZ) =>
            setDragPreview({
              a: clamp(view.toRawX(visualX), grid.bounds.xMin, grid.bounds.xMax),
              b: clamp(view.toRawZ(visualZ), grid.bounds.yMin, grid.bounds.yMax),
            })
          }
        />

        {/* Initial-values marker: draggable, shared by every rule (DESIGN.md §9's start-point drag, adapted to dataset mode). */}
        <StartMarker
          position={[view.toVisualX(markerPoint.a), markerHeight + MARKER_LIFT, view.toVisualZ(markerPoint.b)]}
          onPointerDown={() => beginDrag(entries.map((e) => e.runner))}
        />

        {entries
          .filter((e) => e.rule.visible)
          .map((e) => (
            <RuleOverlay key={e.rule.id} entry={e} min={min} span={span} aName={aName} bName={bName} view={view} />
          ))}

        {/* enableDamping defaults to true in drei's OrbitControls — off here for the same reason as surface mode's Surface3D: no residual momentum after a rotate/zoom gesture. */}
        <OrbitControls ref={controlsRef} enableDamping={false} enableRotate enablePan enableZoom />
      </Canvas>
    </div>
  );
}
