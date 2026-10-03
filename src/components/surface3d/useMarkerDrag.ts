import { useEffect, useRef, useState } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Steppable } from "../../domain/simulation/RunnerInterfaces";

/**
 * The start-marker drag gesture shared by both 3D views (DESIGN.md §9):
 * pressing the marker pauses every running rule and disables the orbit
 * controls; moving updates a local preview; releasing anywhere in the
 * window commits the preview through `onCommit` and re-enables the
 * controls. Runners' live trajectories are never touched — only their
 * *next* Reset seeds from the committed value.
 */
export function useMarkerDrag<P>(onCommit: (point: P) => void) {
  const draggingRef = useRef(false);
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const [dragPreview, setDragPreview] = useState<P | null>(null);
  // Read through a ref so a new callback identity never re-binds the window listener.
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  useEffect(() => {
    const handleWindowPointerUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      if (controlsRef.current) controlsRef.current.enabled = true;
      setDragPreview((preview) => {
        if (preview) onCommitRef.current(preview);
        return null;
      });
    };
    window.addEventListener("pointerup", handleWindowPointerUp);
    return () => window.removeEventListener("pointerup", handleWindowPointerUp);
  }, []);

  const beginDrag = (runners: readonly Steppable[]) => {
    draggingRef.current = true;
    if (controlsRef.current) controlsRef.current.enabled = false;
    for (const runner of runners) {
      if (runner.status === "running") runner.pause();
    }
  };

  return { draggingRef, controlsRef, dragPreview, setDragPreview, beginDrag };
}
