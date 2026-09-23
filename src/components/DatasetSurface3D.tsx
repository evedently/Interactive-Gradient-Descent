import { OrbitControls } from "@react-three/drei";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import type { MutableRefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { computeFullDatasetLoss } from "../domain/dataset/evaluatePerExampleLoss";
import type { DatasetLossGrid } from "../domain/dataset/datasetLossGrid";
import type { CompiledPerExampleLoss, Dataset } from "../domain/dataset/types";
import type { PrimaryVariable } from "../domain/rules/ruleCompiler";
import type { DatasetSimulationRunner } from "../domain/simulation/DatasetSimulationRunner";
import { decimateForDisplay, MAX_RENDERED_TRAJECTORY_POINTS } from "../domain/visualization/decimate";
import { buildGeometryFromGrid, normalizeHeight, VISUAL_HEIGHT } from "../domain/visualization/surfaceGeometry";
import { useRunnersVersion } from "../hooks/useRunnersVersion";
import { useWorkspaceStore } from "../state/workspaceStore";
import type { RuleWorkspaceEntry } from "../state/workspaceStore";
import type { DatasetRuleRunnerEntry } from "./MetricCharts";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Same role as `Surface3D`'s own: an invisible, raycastable plane above the tallest possible surface point, giving the initial-values drag a reliable target even over a masked (missing-triangle) grid cell. */
function DragCatchPlane({
  draggingRef,
  onDragMove,
}: {
  draggingRef: MutableRefObject<boolean>;
  onDragMove: (worldX: number, worldZ: number) => void;
}) {
  return (
    <mesh
      position={[0, VISUAL_HEIGHT + 1, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => {
        if (!draggingRef.current) return;
        e.stopPropagation();
        onDragMove(e.point.x, e.point.z);
      }}
    >
      <planeGeometry args={[400, 400]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

function TrajectoryLine({ points, color }: { points: THREE.Vector3[]; color: string }) {
  const line = useMemo(() => {
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color }));
  }, [points, color]);
  return <primitive object={line} />;
}

function UpdateArrow({ origin, direction, color }: { origin: THREE.Vector3; direction: THREE.Vector3; color: string }) {
  const arrow = useMemo(() => new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, 0xffd23f, 0.15, 0.1), []);
  const length = direction.length();
  useEffect(() => {
    arrow.position.copy(origin);
    if (length > 1e-9) arrow.setDirection(direction.clone().normalize());
    arrow.setLength(Math.max(length, 1e-6), 0.15, 0.1);
    arrow.setColor(new THREE.Color(color));
  }, [arrow, origin, direction, length, color]);
  return <primitive object={arrow} />;
}

/**
 * One visible rule's trajectory + current point + pending update vector, in
 * this rule's own color. The trajectory's HEIGHT uses `fullLoss` — the
 * mean loss over the whole dataset, self-consistent with the surface's own
 * height at any (a, b) — never `batchLoss`, which is only a mini-batch
 * estimate and would make the marker sit off the surface it's supposedly
 * standing on (the extension this component exists for: DESIGN.md §18
 * Phase 7's "trajectory's height should use full-dataset loss").
 */
function RuleOverlay({
  rule,
  runner,
  min,
  span,
  aName,
  bName,
}: {
  rule: RuleWorkspaceEntry;
  runner: DatasetSimulationRunner;
  min: number;
  span: number;
  aName: string;
  bName: string;
}) {
  const current = runner.current;
  const currentHeight = normalizeHeight(current.fullLoss, min, span);
  const peek = runner.peekUpdate();
  const trajectoryPoints = useMemo(
    () =>
      decimateForDisplay(runner.trajectory, MAX_RENDERED_TRAJECTORY_POINTS).map(
        (p) => new THREE.Vector3(p.coords[aName], normalizeHeight(p.fullLoss, min, span) + 0.02, p.coords[bName]),
      ),
    [runner, min, span, aName, bName],
  );

  return (
    <>
      <mesh position={[current.coords[aName], currentHeight + 0.05, current.coords[bName]]}>
        <sphereGeometry args={[0.18, 16, 16]} />
        <meshStandardMaterial color={rule.color} />
      </mesh>
      {trajectoryPoints.length > 1 ? <TrajectoryLine points={trajectoryPoints} color={rule.color} /> : null}
      {peek.ok ? (
        <UpdateArrow
          origin={new THREE.Vector3(current.coords[aName], currentHeight + 0.05, current.coords[bName])}
          direction={new THREE.Vector3(peek.newCoords[aName] - current.coords[aName], 0, peek.newCoords[bName] - current.coords[bName])}
          color={rule.color}
        />
      ) : null}
    </>
  );
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
  const { geometry, min, span } = useMemo(() => buildGeometryFromGrid(grid), [grid]);
  const controlsRef = useRef<OrbitControlsImpl>(null);

  const draggingRef = useRef(false);
  const [dragPreview, setDragPreview] = useState<{ a: number; b: number } | null>(null);

  const clampToBounds = (x: number, z: number) => ({
    a: clamp(x, grid.bounds.xMin, grid.bounds.xMax),
    b: clamp(z, grid.bounds.yMin, grid.bounds.yMax),
  });

  const markerPoint = dragPreview ?? { a: initialValues[aName] ?? 0, b: initialValues[bName] ?? 0 };
  const markerLoss = computeFullDatasetLoss(perExampleLoss, dataset, { [aName]: markerPoint.a, [bName]: markerPoint.b });
  const markerHeight = normalizeHeight(markerLoss, min, span);

  useEffect(() => {
    const handleWindowPointerUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      if (controlsRef.current) controlsRef.current.enabled = true;
      setDragPreview((preview) => {
        if (preview) setDatasetInitialValues({ [aName]: preview.a, [bName]: preview.b });
        return null;
      });
    };
    window.addEventListener("pointerup", handleWindowPointerUp);
    return () => window.removeEventListener("pointerup", handleWindowPointerUp);
  }, [aName, bName, setDatasetInitialValues]);

  return (
    <div className="surface3d-container">
      <div className="view-controls">
        <button onClick={() => controlsRef.current?.reset()}>Reset view</button>
      </div>
      <Canvas camera={{ position: [8, 18, 22], fov: 50, near: 0.1, far: 200 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[8, 15, 8]} intensity={0.8} />
        <axesHelper args={[10]} />
        <gridHelper args={[20, 20]} />

        <mesh geometry={geometry}>
          {/* vertexColors reads the geometry's per-vertex `color` attribute (buildGeometryFromGrid) — the same contour ramp as DatasetContourPlot2D, wrapped around the mesh. Material color stays white since it multiplies against vertex color. */}
          <meshStandardMaterial vertexColors color="#ffffff" side={THREE.DoubleSide} />
        </mesh>

        <DragCatchPlane draggingRef={draggingRef} onDragMove={(x, z) => setDragPreview(clampToBounds(x, z))} />

        {/* Initial-values marker: draggable, shared by every rule (DESIGN.md §9's start-point drag, adapted to dataset mode). */}
        <mesh
          position={[markerPoint.a, markerHeight + 0.05, markerPoint.b]}
          onPointerDown={(e: ThreeEvent<PointerEvent>) => {
            e.stopPropagation();
            draggingRef.current = true;
            if (controlsRef.current) controlsRef.current.enabled = false;
            for (const { runner } of entries) {
              if (runner.status === "running") runner.pause();
            }
          }}
        >
          <sphereGeometry args={[0.22, 16, 16]} />
          <meshStandardMaterial color="#e8e8e8" />
        </mesh>

        {entries
          .filter((e) => e.rule.visible)
          .map((e) => <RuleOverlay key={e.rule.id} rule={e.rule} runner={e.runner} min={min} span={span} aName={aName} bName={bName} />)}

        {/* enableDamping defaults to true in drei's OrbitControls — off here for the same reason as surface mode's Surface3D: no residual momentum after a rotate/zoom gesture. */}
        <OrbitControls ref={controlsRef} enableDamping={false} enableRotate enablePan enableZoom />
      </Canvas>
    </div>
  );
}
