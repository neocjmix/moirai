/** Select paint targets, not geometry/label-policy inputs. Exact zero only:
 * preserve every nonzero fade value and the small Composite point convention.
 * Removed targets still pass through the existing 220ms exit presence.
 */
export function selectCompositePaintTargets<
  T extends {
    opacity: number;
    surfaceOpacity: number;
    compactPoint?: object | null;
  }
>(regions: readonly T[]): T[] {
  return regions.filter(
    (region) =>
      region.opacity !== 0 &&
      (Boolean(region.compactPoint) || region.surfaceOpacity !== 0)
  );
}
