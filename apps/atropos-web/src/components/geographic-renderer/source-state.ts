export type GeographicSourceState = Readonly<{
  key: string | undefined;
  generation: number;
  failed: boolean;
}>;

/** Accept together with the new scene. Repeated reads of the same layout
 * cannot reset its failure; returning to a layout creates a fresh attempt. */
export function acceptGeographicSource(
  state: GeographicSourceState,
  key: string | undefined
): GeographicSourceState {
  return state.key === key
    ? state
    : { key, generation: state.generation + 1, failed: false };
}

/** A disposed renderer's callback cannot disable a later source generation. */
export function failGeographicSource(
  state: GeographicSourceState,
  generation: number
): GeographicSourceState {
  return state.generation === generation && !state.failed
    ? { ...state, failed: true }
    : state;
}
