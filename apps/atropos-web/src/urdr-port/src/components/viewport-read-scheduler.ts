/** Coalesce camera updates without starving reads during a sustained gesture.
 * One read finishes at a time; its successor always uses the latest camera.
 * A context change disposes the scheduler so its result cannot update the UI.
 */
export function createViewportReadScheduler() {
  let disposed = false;
  let running = false;
  let next: (() => Promise<void>) | null = null;
  let interval = 0;
  let lastStarted = -Infinity;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let scheduledAt = Infinity;
  const schedule = () => {
    if (disposed || running || !next) return;
    const deadline = Math.max(Date.now(), lastStarted + interval);
    if (timer !== undefined && scheduledAt <= deadline) return;
    if (timer !== undefined) clearTimeout(timer);
    scheduledAt = deadline;
    timer = setTimeout(() => {
      timer = undefined;
      scheduledAt = Infinity;
      if (disposed || !next) return;
      const task = next;
      next = null;
      running = true;
      lastStarted = Date.now();
      // The read task owns user-facing error state. Still drain the newest
      // camera after failure so an error cannot strand navigation permanently.
      void Promise.resolve().then(task).catch(() => undefined).finally(() => {
        running = false;
        schedule();
      });
    }, Math.max(0, deadline - Date.now()));
  };
  return {
    get active() { return !disposed; },
    request(task: () => Promise<void>, minIntervalMs = 0) {
      if (disposed) return;
      next = task;
      interval = minIntervalMs;
      schedule();
    },
    dispose() {
      disposed = true;
      next = null;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    },
  };
}
