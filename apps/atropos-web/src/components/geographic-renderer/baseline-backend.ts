import { createWebGLPainter } from "../geographic-webgl";
import type { GeographicRendererBackend } from "./contract";

/** Keep the baseline's actual painter and algorithms intact behind the same
 * scene/lifecycle boundary as the alternatives. */
export function createBaselineBackend(
  canvas: HTMLCanvasElement
): GeographicRendererBackend {
  const painter = createWebGLPainter(canvas);
  return {
    render: (scene, frame) => painter.draw(scene, frame.now),
    dispose: () => painter.dispose(),
    stats: () => ({
      drawCalls: Number(canvas.dataset.drawCalls || 0),
      meshBuilds: Number(canvas.dataset.meshBuilds || 0),
      bufferUploads: Number(canvas.dataset.bufferUploads || 0),
      hullCount: Number(canvas.dataset.meshCount || 0),
      pointCount: Number(canvas.dataset.pointCount || 0),
      resourceBytes:
        Number(canvas.dataset.meshBytes || 0) +
        Number(canvas.dataset.pigmentBytes || 0)
    })
  };
}
