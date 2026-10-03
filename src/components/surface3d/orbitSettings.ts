import * as THREE from "three";
import type { CameraMode } from "../../state/workspaceStore";

export interface OrbitSettings {
  enableDamping: boolean;
  enableRotate: boolean;
  enablePan: boolean;
  enableZoom: boolean;
  mouseButtons: { LEFT: THREE.MOUSE; MIDDLE: THREE.MOUSE; RIGHT: THREE.MOUSE };
}

/**
 * OrbitControls configuration for the Rotate/Pan camera toggle, shared by
 * both 3D views: the chosen mode owns the left mouse button; the wheel and
 * middle button always zoom.
 *
 * Damping is off entirely: drei enables it by default, and residual
 * scroll/drag velocity would keep easing the camera for a second or two
 * after a gesture ends — unwanted drift in a precise teaching tool.
 */
export function orbitSettingsFor(mode: CameraMode): OrbitSettings {
  const rotate = mode === "rotate";
  return {
    enableDamping: false,
    enableRotate: rotate,
    enablePan: !rotate,
    enableZoom: true,
    mouseButtons: rotate
      ? { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
      : { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE },
  };
}
