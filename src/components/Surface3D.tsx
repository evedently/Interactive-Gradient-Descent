import { Canvas } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import { evaluateLoss } from "../domain/lossFunction";
import type { SimulationRunner } from "../domain/simulation/SimulationRunner";
import { decimateForDisplay, MAX_RENDERED_TRAJECTORY_POINTS } from "../domain/visualization/decimate";
import { buildSurfaceGeometry, normalizeHeight, surfaceViewTransformFor, type SurfaceViewTransform } from "../domain/visualization/surfaceGeometry";
import type { RuleEntry } from "../hooks/useRuleEntries";
import { useRunnersVersion } from "../hooks/useRunnersVersion";
import { clamp } from "../lib/math";
import { useWorkspaceStore } from "../state/workspaceStore";
import { DRAG_PLANE_SIZE, DragCatchPlane, MARKER_LIFT, RuleOverlayMarks, SCENE_CAMERA, StartMarker, SurfaceBackdrop, TRAJECTORY_LIFT } from "./surface3d/SceneParts";
import { CameraModeButtons, SceneOrbitControls } from "./surface3d/CameraControls";
import { useMarkerDrag } from "./surface3d/useMarkerDrag";

export type RuleRunnerEntry = RuleEntry<SimulationRunner>;

interface Props {
  entries: RuleRunnerEntry[];
}

/**
 * One visible rule's overlay. `runner.current`/`.trajectory` are always in
 * RAW loss-space coordinates — `viewTransform` maps each one into the same
 * fixed visual footprint the mesh itself is built in (DESIGN.md §8), so a
 * trajectory stays correctly plotted on the surface no matter how the
 * presenter has zoomed the view.
 */
function RuleOverlay({ entry, min, span, viewTransform }: { entry: RuleRunnerEntry; min: number; span: number; viewTransform: SurfaceViewTransform }) {
  const { rule, runner } = entry;
  const current = runner.current;
  const peek = runner.peekUpdate();
  const trajectory = useMemo(
    () =>
      decimateForDisplay(runner.trajectory, MAX_RENDERED_TRAJECTORY_POINTS).map(
        (p) => new THREE.Vector3(viewTransform.toVisualX(p.x), normalizeHeight(p.loss, min, span) + TRAJECTORY_LIFT, viewTransform.toVisualZ(p.y)),
      ),
    // Keyed on the trajectory array and its length, not the runner: a runner
    // stays the same object while its path grows (push) and Reset swaps in
    // a new array, so keying on `runner` drew a stale path that never went away.
    [runner.trajectory, runner.trajectory.length, min, span, viewTransform],
  );
  const currentVisual = new THREE.Vector3(
    viewTransform.toVisualX(current.x),
    normalizeHeight(current.loss, min, span) + MARKER_LIFT,
    viewTransform.toVisualZ(current.y),
  );
  // A delta, not a position — scaled, never re-centered.
  const update = peek.ok ? new THREE.Vector3(peek.dx * viewTransform.scaleX, 0, peek.dy * viewTransform.scaleZ) : null;

  return <RuleOverlayMarks color={rule.color} current={currentVisual} trajectory={trajectory} update={update} />;
}

export function Surface3D({ entries }: Props) {
  useRunnersVersion(entries.map((e) => e.runner));
  const activeLossAst = useWorkspaceStore((s) => s.activeLoss.ast);
  const startPoint = useWorkspaceStore((s) => s.startPoint);
  const setStartPoint = useWorkspaceStore((s) => s.setStartPoint);
  const bounds = useWorkspaceStore((s) => s.surfaceBounds);

  const { geometry, min, span } = useMemo(() => buildSurfaceGeometry(activeLossAst, bounds), [activeLossAst, bounds]);
  const viewTransform = useMemo(() => surfaceViewTransformFor(bounds), [bounds]);
  const { draggingRef, controlsRef, dragPreview, setDragPreview, beginDrag } = useMarkerDrag<{ x: number; y: number }>(setStartPoint);

  const markerPoint = dragPreview ?? startPoint;
  const markerHeight = normalizeHeight(evaluateLoss(activeLossAst, markerPoint.x, markerPoint.y), min, span);

  return (
    <div className="surface3d-container">
      <CameraModeButtons controlsRef={controlsRef} />
      <Canvas camera={SCENE_CAMERA}>
        <SurfaceBackdrop geometry={geometry} />

        <DragCatchPlane
          draggingRef={draggingRef}
          size={DRAG_PLANE_SIZE}
          onDragMove={(visualX, visualZ) =>
            setDragPreview({
              x: clamp(viewTransform.toRawX(visualX), bounds.xMin, bounds.xMax),
              y: clamp(viewTransform.toRawZ(visualZ), bounds.yMin, bounds.yMax),
            })
          }
        />

        {/* Start-point marker: draggable, shared by every rule. */}
        <StartMarker
          position={[viewTransform.toVisualX(markerPoint.x), markerHeight + MARKER_LIFT, viewTransform.toVisualZ(markerPoint.y)]}
          onPointerDown={() => beginDrag(entries.map((e) => e.runner))}
        />

        {entries
          .filter((e) => e.rule.visible)
          .map((e) => (
            <RuleOverlay key={e.rule.id} entry={e} min={min} span={span} viewTransform={viewTransform} />
          ))}

        <SceneOrbitControls controlsRef={controlsRef} />
      </Canvas>
    </div>
  );
}
