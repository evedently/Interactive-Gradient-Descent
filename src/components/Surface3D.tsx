import { OrbitControls } from "@react-three/drei";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import type { MutableRefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { evaluateLoss } from "../domain/lossFunction";
import type { SimulationRunner } from "../domain/simulation/SimulationRunner";
import { decimateForDisplay, MAX_RENDERED_TRAJECTORY_POINTS } from "../domain/visualization/decimate";
import { buildSurfaceGeometry, normalizeHeight, surfaceViewTransformFor, VISUAL_HEIGHT, type SurfaceViewTransform } from "../domain/visualization/surfaceGeometry";
import type { RuleEntry } from "../hooks/useRuleEntries";
import { useRunnersVersion } from "../hooks/useRunnersVersion";
import type { RuleWorkspaceEntry } from "../state/workspaceStore";
import { useWorkspaceStore } from "../state/workspaceStore";

export type RuleRunnerEntry = RuleEntry<SimulationRunner>;

interface Props {
  entries: RuleRunnerEntry[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * An invisible (fully transparent, but still raycastable) plane sitting just
 * above the tallest possible surface point. Its only job is to give the
 * drag gesture a reliable target to raycast against, even over a masked
 * (missing-triangle) region of the surface where the surface mesh itself
 * has no geometry to hit. Fixed size/position, like everything else here —
 * `surfaceViewTransformFor` keeps the whole scene in the same visual
 * footprint regardless of the presenter's actual view bounds, so this
 * plane never needs to change.
 */
function DragCatchPlane({
  draggingRef,
  onDragMove,
}: {
  draggingRef: MutableRefObject<boolean>;
  onDragMove: (visualX: number, visualZ: number) => void;
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
      <planeGeometry args={[200, 200]} />
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
 * One visible rule's trajectory + current point + pending update vector, all
 * in this rule's own color. `runner.current`/`.trajectory` are always in
 * RAW loss-space coordinates — `viewTransform` maps each one into the same
 * fixed visual footprint the mesh itself is built in (DESIGN.md §8), so a
 * trajectory stays correctly plotted on the surface no matter how the
 * presenter has zoomed the view.
 */
function RuleOverlay({
  rule,
  runner,
  min,
  span,
  viewTransform,
}: {
  rule: RuleWorkspaceEntry;
  runner: SimulationRunner;
  min: number;
  span: number;
  viewTransform: SurfaceViewTransform;
}) {
  const current = runner.current;
  const currentHeight = normalizeHeight(current.loss, min, span);
  const peek = runner.peekUpdate();
  const trajectoryPoints = useMemo(
    () =>
      decimateForDisplay(runner.trajectory, MAX_RENDERED_TRAJECTORY_POINTS).map(
        (p) => new THREE.Vector3(viewTransform.toVisualX(p.x), normalizeHeight(p.loss, min, span) + 0.02, viewTransform.toVisualZ(p.y)),
      ),
    [runner, min, span, viewTransform],
  );
  const visualX = viewTransform.toVisualX(current.x);
  const visualZ = viewTransform.toVisualZ(current.y);

  return (
    <>
      <mesh position={[visualX, currentHeight + 0.05, visualZ]}>
        <sphereGeometry args={[0.18, 16, 16]} />
        <meshStandardMaterial color={rule.color} />
      </mesh>
      {trajectoryPoints.length > 1 ? <TrajectoryLine points={trajectoryPoints} color={rule.color} /> : null}
      {peek.ok ? (
        <UpdateArrow
          origin={new THREE.Vector3(visualX, currentHeight + 0.05, visualZ)}
          // A delta, not a position — scaled, never re-centered.
          direction={new THREE.Vector3(peek.dx * viewTransform.scaleX, 0, peek.dy * viewTransform.scaleZ)}
          color={rule.color}
        />
      ) : null}
    </>
  );
}

export function Surface3D({ entries }: Props) {
  useRunnersVersion(entries.map((e) => e.runner));
  const activeLossAst = useWorkspaceStore((s) => s.activeLoss.ast);
  const startPoint = useWorkspaceStore((s) => s.startPoint);
  const setStartPoint = useWorkspaceStore((s) => s.setStartPoint);
  const cameraMode = useWorkspaceStore((s) => s.cameraMode);
  const setCameraMode = useWorkspaceStore((s) => s.setCameraMode);
  const bounds = useWorkspaceStore((s) => s.surfaceBounds);

  const { geometry, min, span } = useMemo(() => buildSurfaceGeometry(activeLossAst, bounds), [activeLossAst, bounds]);
  const viewTransform = useMemo(() => surfaceViewTransformFor(bounds), [bounds]);

  const draggingRef = useRef(false);
  const [dragPreview, setDragPreview] = useState<{ x: number; y: number } | null>(null);
  const controlsRef = useRef<OrbitControlsImpl>(null);

  const clampToBounds = (x: number, y: number) => ({
    x: clamp(x, bounds.xMin, bounds.xMax),
    y: clamp(y, bounds.yMin, bounds.yMax),
  });

  const markerPoint = dragPreview ?? startPoint;
  const markerHeight = normalizeHeight(evaluateLoss(activeLossAst, markerPoint.x, markerPoint.y), min, span);
  const markerVisualX = viewTransform.toVisualX(markerPoint.x);
  const markerVisualZ = viewTransform.toVisualZ(markerPoint.y);

  useEffect(() => {
    const handleWindowPointerUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      if (controlsRef.current) controlsRef.current.enabled = true;
      setDragPreview((preview) => {
        if (preview) setStartPoint(preview);
        return null;
      });
    };
    window.addEventListener("pointerup", handleWindowPointerUp);
    return () => window.removeEventListener("pointerup", handleWindowPointerUp);
  }, [setStartPoint]);

  return (
    <div className="surface3d-container">
      <div className="view-controls">
        <button className={cameraMode === "rotate" ? "active" : ""} onClick={() => setCameraMode("rotate")} title="Drag to rotate the camera">
          Rotate
        </button>
        <button className={cameraMode === "pan" ? "active" : ""} onClick={() => setCameraMode("pan")} title="Drag to pan the camera">
          Pan
        </button>
        <button onClick={() => controlsRef.current?.reset()}>Reset view</button>
      </div>
      <Canvas camera={{ position: [8, 18, 22], fov: 50, near: 0.1, far: 200 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[8, 15, 8]} intensity={0.8} />
        <axesHelper args={[10]} />
        <gridHelper args={[20, 20]} />

        <mesh geometry={geometry}>
          {/* vertexColors reads the geometry's per-vertex `color` attribute (buildGeometryFromGrid) — the same contour ramp as ContourPlot2D, wrapped around the mesh. Material color stays white since it multiplies against vertex color. */}
          <meshStandardMaterial vertexColors color="#ffffff" side={THREE.DoubleSide} />
        </mesh>

        <DragCatchPlane
          draggingRef={draggingRef}
          onDragMove={(visualX, visualZ) => setDragPreview(clampToBounds(viewTransform.toRawX(visualX), viewTransform.toRawZ(visualZ)))}
        />

        {/* Start-point marker: draggable, shared by every rule. */}
        <mesh
          position={[markerVisualX, markerHeight + 0.05, markerVisualZ]}
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
          .map((e) => <RuleOverlay key={e.rule.id} rule={e.rule} runner={e.runner} min={min} span={span} viewTransform={viewTransform} />)}

        {/* enableDamping defaults to true in drei's OrbitControls — any residual scroll/drag velocity would otherwise keep easing the camera forward/around for a second or two after the gesture ends, which reads as unwanted drift for a precise teaching tool. Off entirely: input maps directly to camera motion. */}
        <OrbitControls
          ref={controlsRef}
          enableDamping={false}
          enableRotate={cameraMode === "rotate"}
          enablePan={cameraMode === "pan"}
          enableZoom
          mouseButtons={
            cameraMode === "rotate"
              ? { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
              : { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }
          }
        />
      </Canvas>
    </div>
  );
}
