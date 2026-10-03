import type { ThreeEvent } from "@react-three/fiber";
import type { MutableRefObject } from "react";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { VISUAL_HEIGHT } from "../../domain/visualization/surfaceGeometry";

/** Shared by both 3D views so surface and dataset mode frame their scenes identically. */
export const SCENE_CAMERA = { position: [8, 18, 22] as [number, number, number], fov: 50, near: 0.1, far: 200 };

/** How far above the surface every marker sphere and arrow floats, so it never z-fights the mesh. */
export const MARKER_LIFT = 0.05;
/** Trajectory lines float slightly above the surface for the same reason. */
export const TRAJECTORY_LIFT = 0.02;
const UPDATE_ARROW_COLOR = 0xffd23f;
const ARROW_HEAD_LENGTH = 0.15;
const ARROW_HEAD_WIDTH = 0.1;
const START_MARKER_COLOR = "#e8e8e8";

/** Lights, axes, floor grid, and the vertex-colored surface mesh. */
export function SurfaceBackdrop({ geometry }: { geometry: THREE.BufferGeometry }) {
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[8, 15, 8]} intensity={0.8} />
      <axesHelper args={[10]} />
      <gridHelper args={[20, 20]} />
      <mesh geometry={geometry}>
        {/* vertexColors reads the geometry's per-vertex `color` attribute (buildGeometryFromGrid) — the same contour ramp as the 2D contour plot, wrapped around the mesh. Material color stays white since it multiplies against vertex color. */}
        <meshStandardMaterial vertexColors color="#ffffff" side={THREE.DoubleSide} />
      </mesh>
    </>
  );
}

/**
 * An invisible (fully transparent, but still raycastable) plane sitting just
 * above the tallest possible surface point. Its only job is to give the
 * marker drag gesture a reliable target to raycast against, even over a
 * masked (missing-triangle) region where the surface mesh has no geometry
 * to hit.
 */
export function DragCatchPlane({
  draggingRef,
  size,
  onDragMove,
}: {
  draggingRef: MutableRefObject<boolean>;
  size: number;
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
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

/** The shared, draggable start-point / initial-values marker. */
export function StartMarker({ position, onPointerDown }: { position: [number, number, number]; onPointerDown: () => void }) {
  return (
    <mesh
      position={position}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        onPointerDown();
      }}
    >
      <sphereGeometry args={[0.22, 16, 16]} />
      <meshStandardMaterial color={START_MARKER_COLOR} />
    </mesh>
  );
}

export function TrajectoryLine({ points, color }: { points: THREE.Vector3[]; color: string }) {
  const line = useMemo(() => {
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color }));
  }, [points, color]);
  return <primitive object={line} />;
}

export function UpdateArrow({ origin, direction, color }: { origin: THREE.Vector3; direction: THREE.Vector3; color: string }) {
  const arrow = useMemo(
    () => new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, UPDATE_ARROW_COLOR, ARROW_HEAD_LENGTH, ARROW_HEAD_WIDTH),
    [],
  );
  const length = direction.length();
  useEffect(() => {
    arrow.position.copy(origin);
    if (length > 1e-9) arrow.setDirection(direction.clone().normalize());
    arrow.setLength(Math.max(length, 1e-6), ARROW_HEAD_LENGTH, ARROW_HEAD_WIDTH);
    arrow.setColor(new THREE.Color(color));
  }, [arrow, origin, direction, length, color]);
  return <primitive object={arrow} />;
}

/** One rule's current point, trajectory, and pending update vector, all in that rule's color. Coordinates are already in visual space. */
export function RuleOverlayMarks({
  color,
  current,
  trajectory,
  update,
}: {
  color: string;
  current: THREE.Vector3;
  trajectory: THREE.Vector3[];
  update: THREE.Vector3 | null;
}) {
  return (
    <>
      <mesh position={current}>
        <sphereGeometry args={[0.18, 16, 16]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {trajectory.length > 1 ? <TrajectoryLine points={trajectory} color={color} /> : null}
      {update ? <UpdateArrow origin={current} direction={update} color={color} /> : null}
    </>
  );
}
