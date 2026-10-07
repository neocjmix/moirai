export type PanVelocity = { x: number; y: number };
type Sample = PanVelocity & { time: number };

const SAMPLE_WINDOW_MS = 100;
const RELEASE_PAUSE_MS = 80;
const MIN_SPEED = 0.08;
const MAX_SPEED = 1.6;
const DECAY_MS = 240;
const STOP_SPEED = 0.02;
const MAX_DURATION_MS = 1200;

/** Tracks contact intent outside React's render batches. A pinch never turns
 * into a flick when its last finger lifts, and desktop drags remain direct. */
export function createPanInertiaTracker() {
  const contacts = new Set<number>();
  let samples: Sample[] = [];
  let origin: Sample | null = null;
  let blocked = false;
  return {
    has(id: number) {
      return contacts.has(id);
    },
    start(id: number, point: PanVelocity, time: number, pointerType: string) {
      if (contacts.size === 0) {
        blocked = pointerType !== "touch" && pointerType !== "pen";
        origin = { ...point, time };
        samples = [origin];
      } else {
        blocked = true;
        samples = [];
      }
      contacts.add(id);
    },
    move(id: number, point: PanVelocity, time: number) {
      if (!contacts.has(id) || blocked || contacts.size !== 1) return;
      const previous = samples.at(-1);
      if (previous && time <= previous.time) return;
      samples.push({ ...point, time });
      samples = samples.filter(
        (sample) => time - sample.time <= SAMPLE_WINDOW_MS
      );
    },
    end(id: number, time: number, released: boolean): PanVelocity | null {
      if (!contacts.delete(id)) return null;
      if (contacts.size !== 0) return null;
      const first = samples[0];
      const last = samples.at(-1);
      let velocity: PanVelocity | null = null;
      if (
        released &&
        !blocked &&
        origin &&
        first &&
        last &&
        time >= last.time &&
        time - last.time <= RELEASE_PAUSE_MS &&
        last.time - first.time >= 12 &&
        Math.hypot(last.x - origin.x, last.y - origin.y) > 8
      ) {
        const elapsed = Math.max(12, time - first.time);
        const x = (last.x - first.x) / elapsed;
        const y = (last.y - first.y) / elapsed;
        const speed = Math.hypot(x, y);
        if (speed >= MIN_SPEED) {
          const scale = Math.min(1, MAX_SPEED / speed);
          velocity = { x: x * scale, y: y * scale };
        }
      }
      samples = [];
      origin = null;
      blocked = false;
      return velocity;
    },
    cancel() {
      contacts.clear();
      samples = [];
      origin = null;
      blocked = false;
    },
    suppress() {
      // Keep contacts until their pointerup/cancel so the owning camera can
      // release its gesture baseline normally after a navigation interruption.
      samples = [];
      blocked = true;
    }
  };
}

/** Closed-form displacement has the same duration and endpoint at 30/60/120Hz
 * and after a delayed frame. Velocity is in CSS pixels per millisecond. */
export function panInertiaFrame(velocity: PanVelocity, elapsedMs: number) {
  const speed = Math.hypot(velocity.x, velocity.y);
  const duration = Math.min(
    MAX_DURATION_MS,
    Math.max(0, DECAY_MS * Math.log(speed / STOP_SPEED))
  );
  const elapsed = Math.min(duration, Math.max(0, elapsedMs));
  const distance = DECAY_MS * -Math.expm1(-elapsed / DECAY_MS);
  return {
    x: velocity.x * distance,
    y: velocity.y * distance,
    done: elapsed >= duration
  };
}
