import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { orbitSettingsFor } from "../../../../src/components/surface3d/orbitSettings";

describe("orbitSettingsFor", () => {
  it("orbitSettingsFor_rotate_leftDragRotatesAndPanIsOff", () => {
    const s = orbitSettingsFor("rotate");
    expect(s).toMatchObject({ enableRotate: true, enablePan: false, enableZoom: true, enableDamping: false });
    expect(s.mouseButtons.LEFT).toBe(THREE.MOUSE.ROTATE);
  });

  it("orbitSettingsFor_pan_leftDragPansAndRotateIsOff", () => {
    const s = orbitSettingsFor("pan");
    expect(s).toMatchObject({ enableRotate: false, enablePan: true, enableZoom: true, enableDamping: false });
    expect(s.mouseButtons.LEFT).toBe(THREE.MOUSE.PAN);
  });

  it("orbitSettingsFor_eitherMode_middleButtonZooms", () => {
    expect(orbitSettingsFor("rotate").mouseButtons.MIDDLE).toBe(THREE.MOUSE.DOLLY);
    expect(orbitSettingsFor("pan").mouseButtons.MIDDLE).toBe(THREE.MOUSE.DOLLY);
  });
});
