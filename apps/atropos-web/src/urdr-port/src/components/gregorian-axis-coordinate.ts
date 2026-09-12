/** Matches semantic-layout numericReference; presentation only, never canonical time. */
const MEAN_YEAR_MS = 31_556_952_000;
const WORLD_UNITS_PER_YEAR = 140;
const ORIGIN_MS = -62_167_219_200_000; // 0000-01-01T00:00:00Z
export function elapsedWorldYToGregorianDate(worldY: number): Date {
  return new Date(ORIGIN_MS + worldY / WORLD_UNITS_PER_YEAR * MEAN_YEAR_MS);
}
export function elapsedGregorianDateToWorldY(date: Date): number {
  return (date.getTime() - ORIGIN_MS) / MEAN_YEAR_MS * WORLD_UNITS_PER_YEAR;
}
