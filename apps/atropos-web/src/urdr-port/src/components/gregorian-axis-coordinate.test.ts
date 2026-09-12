import { expect, it } from "vitest";
import { elapsedGregorianDateToWorldY, elapsedWorldYToGregorianDate } from "./gregorian-axis-coordinate";
it("aligns Gregorian ticks with the producer's elapsed-year coordinates", () => {
  expect(elapsedGregorianDateToWorldY(new Date("0000-01-01T00:00:00Z"))).toBe(0);
  for (const iso of ["1380-01-01T00:00:00.000Z", "1468-12-31T12:00:00.000Z", "2000-02-29T06:30:00.000Z"]) {
    const date = new Date(iso);
    const expected = (date.getTime() - new Date("0000-01-01T00:00:00Z").getTime()) / 31_556_952_000 * 140;
    expect(elapsedGregorianDateToWorldY(date)).toBe(expected);
    expect(Math.abs(elapsedWorldYToGregorianDate(expected).getTime() - date.getTime())).toBeLessThanOrEqual(1);
  }
});
