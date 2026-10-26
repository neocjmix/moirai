type FrameIdentity = {
  sessionId: string;
  frameId: number;
  requestId: number;
  state: { tick: number };
};

/** A stopped Worker may still have a final immutable scene awaiting paint. */
export function isGraphFramePending({
  enabled,
  loading,
  error,
  requestId,
  requestedTick,
  frame,
  paintedFrame
}: {
  enabled: boolean;
  loading: boolean;
  error: string | null;
  requestId: number;
  requestedTick: number;
  frame: FrameIdentity | null;
  paintedFrame: FrameIdentity | null;
}): boolean {
  if (!enabled || error) return false;
  return (
    loading ||
    !frame ||
    !paintedFrame ||
    frame.requestId !== requestId ||
    paintedFrame.requestId !== requestId ||
    frame.sessionId !== paintedFrame.sessionId ||
    frame.frameId !== paintedFrame.frameId ||
    paintedFrame.state.tick !== requestedTick
  );
}
