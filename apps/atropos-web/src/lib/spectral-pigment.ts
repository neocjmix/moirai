import { Color } from "spectral.js";

/*
 * Six-band approximation of Spectral.js 3.0.0's 38-band Kubelka–Munk model.
 * Spectral.js produces the source reflectance and XYZ values; the six samples
 * are fitted once per material to preserve the original standalone color.
 * Only the GPU performs per-pixel mixing. This is not an exact 38-band solver.
 *
 * CIE/D65 integration and XYZ→RGB constants are derived from:
 * https://github.com/rvanwijnen/spectral.js/blob/3.0.0/spectral.js
 *
 * MIT License — Copyright (c) 2025 Ronald van Wijnen
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

type RGB = readonly [number, number, number];
export type PigmentBands = readonly [
  number,
  number,
  number,
  number,
  number,
  number
];
export type SpectralPigmentMaterial = Readonly<{
  ks: PigmentBands;
  luminance: number;
}>;

export const SPECTRAL_PIGMENT_WAVELENGTHS = [
  450, 470, 500, 530, 580, 600
] as const;

// Integrate the piecewise-linear reflectance between the six wavelengths over
// Spectral.js's complete 380–750nm CIE/D65 table; extend the endpoint samples.
export const SPECTRAL_PIGMENT_XYZ_WEIGHTS: readonly RGB[] = [
  [0.1283306820521419, 0.011282910942491, 0.6579450403025388],
  [0.04553500003624773, 0.03053853315338537, 0.3084067508048341],
  [0.008924945976509533, 0.11045899157858251, 0.10314608494309657],
  [0.10631591306652362, 0.3410670917997034, 0.01715529502160469],
  [0.23825322133566265, 0.2945684944165147, 0.00131596755029294],
  [0.4228043283238535, 0.2120839781093228, 0.0001644085468035]
];

// Wᵀ(WWᵀ)⁻¹: the minimum correction to six reflectances that preserves XYZ.
const FIT_XYZ: readonly RGB[] = [
  [0.2680413897471684, -0.3191213393382899, 1.1907099822830818],
  [-0.20276593935295065, 0.19300188360700457, 0.598114140241879],
  [-0.8639723458970543, 1.0457120384152203, 0.2873112184247445],
  [-1.478739475680041, 2.4158022626407747, 0.15592886397124756],
  [0.17841588414666817, 1.0032593254062356, -0.09543403488747945],
  [2.5951751770437, -1.1188064143557777, -0.4173189112376793]
];

const XYZ_RGB: readonly RGB[] = [
  [3.2409699419045226, -1.537383177570094, -0.4986107602930034],
  [-0.9692436362808796, 1.8759675015077202, 0.04155505740717559],
  [0.05563007969699366, -0.20397695888897652, 1.0569715142428786]
];
const CACHE_LIMIT = 128;
const materials = new Map<string, SpectralPigmentMaterial>();
const cssColors = new Map<string, string>();
const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, n));
const dot = (a: RGB, b: readonly number[]) =>
  a[0] * b[0]! + a[1] * b[1]! + a[2] * b[2]!;

function remember<T>(cache: Map<string, T>, key: string, value: T): T {
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  cache.set(key, value);
  return value;
}

function reflectanceXYZ(reflectance: readonly number[]): RGB {
  return [0, 1, 2].map((channel) =>
    SPECTRAL_PIGMENT_XYZ_WEIGHTS.reduce(
      (sum, weight, i) => sum + weight[channel]! * reflectance[i]!,
      0
    )
  ) as unknown as RGB;
}

/** RGB input is byte-valued, as returned by the painter's CSS color parser. */
export function spectralPigmentMaterial(rgb: RGB): SpectralPigmentMaterial {
  if (rgb.some((value) => !Number.isFinite(value)))
    throw Error("invalid_pigment_color");
  const bytes = rgb.map((value) => Math.round(clamp(value, 0, 255)));
  const key = bytes.join(",");
  const cached = materials.get(key);
  if (cached) return cached;

  const source = new Color(bytes);
  let reflectance = SPECTRAL_PIGMENT_WAVELENGTHS.map(
    (wavelength) => source.R[(wavelength - 380) / 10]!
  );
  // Two bounded projections handle clipping for near-black/white pigments.
  // The existing 12-color palette fits on the first pass without clipping.
  for (let iteration = 0; iteration < 2; iteration++) {
    const xyz = reflectanceXYZ(reflectance);
    const difference = source.XYZ.map((value, i) => value - xyz[i]!);
    reflectance = reflectance.map((value, i) =>
      clamp(value + dot(FIT_XYZ[i]!, difference), 0.00001, 1)
    );
  }
  const ks = reflectance.map((value) => (1 - value) ** 2 / (2 * value));
  // The 128-region scene and alpha<=.9999 permit at most 128*9.211*32
  // absorption in RGBA16F (<65504). Only outlying saturated colors need this
  // concentration bound; all authored palette colors retain their luminance.
  const luminance = Math.min(
    Math.max(0.0001, source.luminance),
    32 / Math.max(1, ...ks)
  );
  return remember(
    materials,
    key,
    Object.freeze({
      ks: Object.freeze(ks) as unknown as PigmentBands,
      luminance
    })
  );
}

/** Material/verification helper; never call this in a CPU pixel loop. */
export function spectralPigmentToSrgb(ks: PigmentBands): RGB {
  // Reciprocal form avoids loss of precision when absorption is high.
  const xyz = reflectanceXYZ(
    ks.map((value) => 1 / (1 + value + Math.sqrt(value * (value + 2))))
  );
  return XYZ_RGB.map((row) => {
    const linear = Math.max(0, dot(row, xyz));
    return clamp(
      linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055
    );
  }) as unknown as RGB;
}

/** Controlled graph palette syntax only; no DOM/canvas readback is needed. */
function paletteRgb(css: string): RGB {
  const hsl = /^hsl\(\s*([-+\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)$/i.exec(css);
  if (hsl) {
    const hue = ((Number(hsl[1]) % 360) + 360) % 360;
    const saturation = clamp(Number(hsl[2]) / 100);
    const lightness = clamp(Number(hsl[3]) / 100);
    const amplitude = saturation * Math.min(lightness, 1 - lightness);
    return [0, 8, 4].map((offset) => {
      const k = (offset + hue / 30) % 12;
      return Math.round(
        255 * (lightness - amplitude * Math.max(-1, Math.min(k - 3, 9 - k, 1)))
      );
    }) as unknown as RGB;
  }
  if (/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(css) || /^rgb\(/i.test(css)) {
    // Version 3's shorthand-hex parser mishandles the leading '#'. Expand it
    // here instead of passing invalid channels into the material cache.
    const expanded = /^#[\da-f]{3}$/i.test(css)
      ? `#${[...css.slice(1)].map((digit) => digit + digit).join("")}`
      : css;
    const parsed = new Color(expanded).sRGB;
    if (parsed?.length === 3 && parsed.every(Number.isFinite))
      return parsed as unknown as RGB;
  }
  throw Error("unsupported_pigment_palette_color");
}

/** Shared Spectral-derived source ink for multiply-based SVG/Canvas fallback.
 * Their overlap is a cheaper approximation, not the GPU's spectral mixture. */
export function pigmentCssColor(css: string): string {
  const cached = cssColors.get(css);
  if (cached) return cached;
  const rgb = spectralPigmentToSrgb(
    spectralPigmentMaterial(paletteRgb(css)).ks
  );
  return remember(
    cssColors,
    css,
    `#${rgb
      .map((value) =>
        Math.round(value * 255)
          .toString(16)
          .padStart(2, "0")
      )
      .join("")}`
  );
}

// Accumulate additively into two RGBA16F targets:
// target0 = vec4(KS0..2 * mass, mass)
// target1 = vec4(KS3..5 * mass, opticalDensity)
// opticalDensity = -log(1-alpha), mass = opticalDensity * material.luminance.
// A single resolve returns pigment sRGB. The caller applies coverage
// 1-exp(-target1.a), premultiplies, and composites over the white background.
// Use highp: the reciprocal K/S inverse remains finite for dark pigments.
export const SPECTRAL_PIGMENT_RESOLVE_GLSL = `
vec3 spectralPigmentReflectance(vec3 ks) {
  return 1.0 / (1.0 + ks + sqrt(ks * (ks + 2.0)));
}
float spectralPigmentCompand(float value) {
  value = max(0.0, value);
  return value <= 0.0031308 ? value * 12.92 : 1.055 * pow(value, 1.0 / 2.4) - 0.055;
}
vec3 spectralPigmentResolve(vec4 bands012Mass, vec4 bands345Coverage) {
  if (bands012Mass.a <= 0.00000001) return vec3(1.0);
  vec3 low = spectralPigmentReflectance(max(vec3(0.0), bands012Mass.rgb / bands012Mass.a));
  vec3 high = spectralPigmentReflectance(max(vec3(0.0), bands345Coverage.rgb / bands012Mass.a));
  vec3 xyz = ${SPECTRAL_PIGMENT_XYZ_WEIGHTS.map(
    (weight, i) =>
      `${i < 3 ? "low" : "high"}[${i % 3}] * vec3(${weight.join(", ")})`
  ).join(" +\n    ")};
  vec3 rgb = vec3(${XYZ_RGB.map((row) => `dot(xyz, vec3(${row.join(", ")}))`).join(", ")});
  return clamp(vec3(spectralPigmentCompand(rgb.r), spectralPigmentCompand(rgb.g), spectralPigmentCompand(rgb.b)), 0.0, 1.0);
}
`;
