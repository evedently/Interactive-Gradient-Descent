import { OrbitControls } from "@react-three/drei";
import type { RefObject } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { orbitSettingsFor } from "./orbitSettings";

type ControlsRef = RefObject<OrbitControlsImpl>;

/** Rotate / Pan / Reset view buttons over a 3D view. The camera mode is one workspace-wide setting, so both 3D views share it. */
export function CameraModeButtons({ controlsRef }: { controlsRef: ControlsRef }) {
  const cameraMode = useWorkspaceStore((s) => s.cameraMode);
  const setCameraMode = useWorkspaceStore((s) => s.setCameraMode);

  return (
    <div className="view-controls">
      <button className={cameraMode === "rotate" ? "active" : ""} onClick={() => setCameraMode("rotate")} title="Drag to rotate the camera">
        Rotate
      </button>
      <button className={cameraMode === "pan" ? "active" : ""} onClick={() => setCameraMode("pan")} title="Drag to pan the camera">
        Pan
      </button>
      <button onClick={() => controlsRef.current?.reset()}>Reset view</button>
    </div>
  );
}

/** The scene's OrbitControls, configured for the current camera mode (see `orbitSettingsFor`). Render inside the `<Canvas>`. */
export function SceneOrbitControls({ controlsRef }: { controlsRef: ControlsRef }) {
  const cameraMode = useWorkspaceStore((s) => s.cameraMode);
  return <OrbitControls ref={controlsRef} {...orbitSettingsFor(cameraMode)} />;
}
