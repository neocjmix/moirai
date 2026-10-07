declare module "spectral.js" {
  export class Color {
    constructor(value: string | number[]);
    readonly R: number[];
    readonly KS: number[];
    readonly XYZ: number[];
    readonly sRGB: number[];
    readonly OKLab: number[];
    readonly luminance: number;
    tintingStrength: number;
    toString(options?: {
      format?: "hex" | "rgb";
      method?: "clip" | "map";
    }): string;
  }
  export function mix(...colors: Array<[Color, number]>): Color;
}
