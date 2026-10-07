import { Color, mix } from "spectral.js";
import { describe, expect, it } from "vitest";
import { compositeColorAssignment } from "../urdr-port/src/components/graph-shell-composite";
import {
  pigmentCssColor,
  spectralPigmentMaterial,
  spectralPigmentToSrgb,
  SPECTRAL_PIGMENT_WAVELENGTHS,
  SPECTRAL_PIGMENT_XYZ_WEIGHTS,
  type PigmentBands
} from "./spectral-pigment";

type RGB = readonly [number, number, number];
function palette() {
  const colors = new Map<number, RGB>();
  for (let i = 0; colors.size < 12 && i < 1000; i++) {
    const { slotIndex, fill } = compositeColorAssignment(`pigment-${i}`);
    const rgb = new Color(pigmentCssColor(fill)).sRGB as unknown as RGB;
    colors.set(slotIndex, rgb);
  }
  expect(colors.size).toBe(12);
  return [...colors.values()];
}
function blend(a: RGB, b: RGB, weight: number) {
  const left = spectralPigmentMaterial(a);
  const right = spectralPigmentMaterial(b);
  const leftMass = left.luminance * (1 - weight);
  const rightMass = right.luminance * weight;
  const ks = left.ks.map(
    (value, i) =>
      (value * leftMass + right.ks[i]! * rightMass) / (leftMass + rightMass)
  ) as unknown as PigmentBands;
  return spectralPigmentToSrgb(ks).map((n) => Math.round(n * 255));
}

describe("bounded Spectral.js pigment material", () => {
  it("integrates all 38 official CIE/D65 samples with the six-band basis", () => {
    const indices = SPECTRAL_PIGMENT_WAVELENGTHS.map((nm) => (nm - 380) / 10);
    for (let node = 0; node < indices.length; node++) {
      const basis = Array.from({ length: 38 }, (_, band) => {
        let left = 0;
        while (left < indices.length - 1 && indices[left + 1]! <= band) left++;
        const right = Math.min(left + 1, indices.length - 1);
        const t =
          right === left || band < indices[0]!
            ? 0
            : (band - indices[left]!) / (indices[right]! - indices[left]!);
        return (left === node ? 1 - t : 0) + (right === node ? t : 0);
      });
      const xyz = new Color(basis).XYZ;
      xyz.forEach((value, channel) =>
        expect(SPECTRAL_PIGMENT_XYZ_WEIGHTS[node]![channel]).toBeCloseTo(
          value,
          12
        )
      );
    }
  });

  it("preserves standalone authored palette colors through spectral reconstruction", () => {
    for (let i = 0; i < 80; i++) {
      const fill = compositeColorAssignment(`pigment-${i}`).fill;
      const match = /^hsl\(([\d.]+) ([\d.]+)% ([\d.]+)%\)$/.exec(fill)!;
      const h = Number(match[1]);
      const s = Number(match[2]) / 100;
      const l = Number(match[3]) / 100;
      const chroma = (1 - Math.abs(2 * l - 1)) * s;
      const secondary = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
      const sectors = [
        [chroma, secondary, 0],
        [secondary, chroma, 0],
        [0, chroma, secondary],
        [0, secondary, chroma],
        [secondary, 0, chroma],
        [chroma, 0, secondary]
      ];
      const expected = sectors[Math.floor(h / 60)]!.map((value) =>
        Math.round(255 * (value + l - chroma / 2))
      );
      const actual = new Color(pigmentCssColor(fill)).sRGB;
      expect(actual).toEqual(expected);
    }
    for (const rgb of palette()) {
      const result = spectralPigmentToSrgb(spectralPigmentMaterial(rgb).ks);
      result.forEach((value, channel) =>
        expect(Math.abs(value * 255 - rgb[channel]!)).toBeLessThan(0.01)
      );
    }
  });

  it("mixes blue and yellow into green rather than their gray RGB midpoint", () => {
    const blue: RGB = [0, 33, 133];
    const yellow: RGB = [252, 210, 0];
    const rgb = blend(blue, yellow, 0.5);
    expect(rgb[1]!).toBeGreaterThan(rgb[0]! + 60);
    expect(rgb[1]!).toBeGreaterThan(rgb[2]! + 75);
    const reference = mix(
      [new Color([...blue]), 1],
      [new Color([...yellow]), 1]
    );
    const actual = new Color(rgb);
    expect(
      Math.hypot(...actual.OKLab.map((n, i) => n - reference.OKLab[i]!))
    ).toBeLessThan(0.012);
  });

  it("bounds reduced-band error against full Spectral.js across palette mixtures", () => {
    const rgb = [...palette(), [0, 33, 133] as const, [252, 210, 0] as const];
    let squaredError = 0;
    let count = 0;
    for (let i = 0; i < rgb.length; i++) {
      for (let j = i; j < rgb.length; j++) {
        for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
          // Spectral.js squares its user factor. sqrt reproduces the linear
          // optical-mass proportions accumulated by the GPU.
          const fullSpectrum = mix(
            [new Color([...rgb[i]!]), Math.sqrt(1 - t)],
            [new Color([...rgb[j]!]), Math.sqrt(t)]
          );
          // The shader clips to displayable sRGB just like upstream GLSL.
          const reference = new Color(
            fullSpectrum.toString({ method: "clip" })
          );
          const result = new Color(blend(rgb[i]!, rgb[j]!, t));
          const error = Math.hypot(
            ...result.OKLab.map((n, channel) => n - reference.OKLab[channel]!)
          );
          expect(error).toBeLessThan(0.019);
          squaredError += error * error;
          count++;
        }
      }
    }
    expect(count).toBe(525);
    expect(Math.sqrt(squaredError / count)).toBeLessThan(0.007);
  });

  it("is order-independent and preserves fallback white and source ink", () => {
    const a: RGB = [232, 122, 89];
    const b: RGB = [88, 153, 228];
    expect(blend(a, b, 0.3)).toEqual(blend(b, a, 0.7));
    expect(pigmentCssColor("#fff")).toBe("#ffffff");
    expect(pigmentCssColor("rgb(214, 120, 92)")).toBe("#d6785c");
  });

  it("caches bounded immutable source materials independently of camera/opacity", () => {
    const first = spectralPigmentMaterial([7, 8, 9]);
    expect(spectralPigmentMaterial([7, 8, 9])).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.ks)).toBe(true);
    for (let i = 0; i < 129; i++) spectralPigmentMaterial([i, 23, 45]);
    const rebuilt = spectralPigmentMaterial([7, 8, 9]);
    expect(rebuilt).not.toBe(first);
    expect(rebuilt).toEqual(first);
  });

  it("keeps dark and light materials finite and rejects invalid source ink", () => {
    for (const rgb of [
      [0, 0, 0],
      [1, 2, 3],
      [255, 255, 255],
      [255, 0, 0],
      [0, 255, 0]
    ] as const) {
      const material = spectralPigmentMaterial(rgb);
      expect(
        material.ks.every((value) => Number.isFinite(value) && value >= 0)
      ).toBe(true);
      expect(material.luminance).toBeGreaterThan(0);
      expect(spectralPigmentToSrgb(material.ks).every(Number.isFinite)).toBe(
        true
      );
      expect(
        Math.max(...material.ks) * material.luminance * 128 * 9.211
      ).toBeLessThan(65504);
    }
    expect(() => spectralPigmentMaterial([NaN, 0, 0])).toThrow(
      "invalid_pigment_color"
    );
    expect(() => pigmentCssColor("url(external)")).toThrow(
      "unsupported_pigment_palette_color"
    );
  });
});
