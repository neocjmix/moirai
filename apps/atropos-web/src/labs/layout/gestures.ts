import {
  addViewportPointer,
  createImageViewportState,
  moveViewportPointer,
  removeViewportPointer,
  resetViewportView,
  type ImageViewportPoint,
  type ImageViewportState,
  type ImageViewportView
} from "../../urdr-port/src/components/image-viewport";
import type { LabCamera } from "./preset";

/** The same pure pointer/axis/pinch-centroid math used by Atropos. This adapter
 * converts only the Lab camera; it imports no GraphShell, reads or scheduling. */
export type LabViewportSize = { width: number; height: number };
export function cameraToView(
  camera: LabCamera,
  size: LabViewportSize
): ImageViewportView {
  const scaleX = size.width / camera.spanX;
  const scaleY = size.height / camera.spanY;
  return {
    scaleX,
    scaleY,
    x: size.width / 2 - camera.x * scaleX,
    y: size.height / 2 - camera.y * scaleY
  };
}
export function viewToCamera(
  view: ImageViewportView,
  size: LabViewportSize
): LabCamera {
  return {
    x: (size.width / 2 - view.x) / view.scaleX,
    y: (size.height / 2 - view.y) / view.scaleY,
    spanX: size.width / view.scaleX,
    spanY: size.height / view.scaleY
  };
}
export function createLabGesture(
  camera: LabCamera,
  size: LabViewportSize
): ImageViewportState {
  return createImageViewportState(cameraToView(camera, size));
}
export function resetLabGesture(
  state: ImageViewportState,
  camera: LabCamera,
  size: LabViewportSize
): ImageViewportState {
  return resetViewportView(state, cameraToView(camera, size));
}
export const addLabPointer = addViewportPointer;
export const removeLabPointer = removeViewportPointer;
export function moveLabPointer(
  state: ImageViewportState,
  id: number,
  point: ImageViewportPoint
): ImageViewportState {
  const next = moveViewportPointer(state, id, point);
  const view = next.view;
  // A 300px+ axis can reach exactly zero when fingers cross. Keep the last
  // finite view until they separate; never store a zero-scale camera in presets.
  return Object.values(view).every(Number.isFinite) &&
    view.scaleX > 0 &&
    view.scaleY > 0
    ? next
    : { ...next, view: state.view };
}
