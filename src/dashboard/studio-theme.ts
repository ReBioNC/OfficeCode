export type StudioPeriod = "morning" | "day" | "evening" | "night";

export function getStudioPeriod(date: Date): StudioPeriod {
  const hour = date.getHours();
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 16) return "day";
  if (hour >= 16 && hour < 19) return "evening";
  return "night";
}

export interface StudioTheme {
  label: string;
  ui: Record<string, string>;
  sky: readonly [string, string, string];
  skyline: string;
  daylight: string;
  lightStrength: number;
  lampStrength: number;
}

export const STUDIO_THEMES: Record<StudioPeriod, StudioTheme> = {
  morning: {
    label: "Morning", sky: ["#83bdcf", "#b8dfdc", "#ffe5b8"], skyline: "#749aa4", daylight: "#ffdf9c", lightStrength: .17, lampStrength: .025,
    ui: { ink: "#243c47", night: "#d6e7e0", paper: "#eef3e8", light: "#f8fbf0", line: "#b4c9bc", muted: "#536d65", sage: "#267d73", red: "#a44850", accent: "#895b24", panel: "#e1ecdf", frame: "#729991", "stage-glow": "#f7e9c9", avatar: "#cdded0", success: "#3a7750", "active-bg": "#d4e3ce" },
  },
  day: {
    label: "Day", sky: ["#60aed1", "#9dd8e7", "#d6f2f3"], skyline: "#6197ab", daylight: "#e8faf3", lightStrength: .20, lampStrength: .015,
    ui: { ink: "#213d55", night: "#d3e7ee", paper: "#edf6f8", light: "#f8fcff", line: "#b0cbd6", muted: "#526f81", sage: "#1e7884", red: "#a54459", accent: "#216b95", panel: "#dcecf2", frame: "#629aac", "stage-glow": "#f0fbff", avatar: "#cce1e8", success: "#357651", "active-bg": "#c9e4ed" },
  },
  evening: {
    label: "Evening", sky: ["#a26b9d", "#ed9991", "#ffcf89"], skyline: "#735671", daylight: "#ffc17f", lightStrength: .13, lampStrength: .08,
    ui: { ink: "#ffead7", night: "#282039", paper: "#3b2c48", light: "#49344f", line: "#79617d", muted: "#d2afbb", sage: "#a3dfce", red: "#ffb097", accent: "#ffc582", panel: "#443049", frame: "#b67b8b", "stage-glow": "#734059", avatar: "#624458", success: "#b6d9a2", "active-bg": "#775064" },
  },
  night: {
    label: "Night", sky: ["#1a2147", "#37385f", "#9b668c"], skyline: "#262e50", daylight: "#d1c5ff", lightStrength: .035, lampStrength: .13,
    ui: { ink: "#fff1df", night: "#0b0e20", paper: "#1c1e3b", light: "#292b4e", line: "#434361", muted: "#adaac6", sage: "#67dccb", red: "#ff827d", accent: "#f8be6a", panel: "#242542", frame: "#8c5d88", "stage-glow": "#292444", avatar: "#414266", success: "#9ae2b0", "active-bg": "#664460" },
  },
};

// Recolor the cached background, retaining every pixel of the tile and rug
// textures. Characters and activity signals keep their session/role colors.
const MATERIAL_COLORS: ReadonlyArray<readonly [string, string, string, string]> = [
  ["#0b0e20", "#d6e7e0", "#d3e7ee", "#282039"],
  ["#a96989", "#729991", "#629aac", "#b67b8b"],
  ["#2a2749", "#d5c8b2", "#c4d8e1", "#53384e"],
  ["#514168", "#d9c9af", "#c3d6df", "#74516b"],
  ["#615073", "#c2b59e", "#adcad6", "#8a6579"],
  ["#8d6a8b", "#8fa7a0", "#7ea9bb", "#bd8992"],
  ["#3d345b", "#adb5a1", "#91b8c7", "#5b3a57"],
  ["#231f3f", "#afc5b6", "#91b6c7", "#47324e"],
  ["#30345d", "#9abbaf", "#97bdcb", "#57415b"],
  ["#393d69", "#a5c5b8", "#a8cbd4", "#63485e"],
  ["#353961", "#9abbaf", "#9dc1cd", "#5b4257"],
  ["#4d5078", "#c3d8c8", "#c4e1e6", "#80627a"],
  ["#54557a", "#b8cfbd", "#bed8df", "#916d81"],
  ["#292e55", "#88ad9e", "#83aeba", "#49354e"],
  ["#493455", "#d7bda6", "#c5c7c4", "#694554"],
  ["#45406b", "#acc6b6", "#b0c6d5", "#5d4666"],
  ["#294a62", "#8fbeb5", "#91c8cc", "#415568"],
  ["#343660", "#b5c7ae", "#aac5cf", "#57415e"],
  ["#493c60", "#cfbba4", "#c4c7be", "#69505d"],
  ["#a05f8f", "#b58679", "#929aa9", "#c07b93"],
  ["#9c86ce", "#7fa693", "#7b9bb9", "#b992c1"],
  ["#59bdb7", "#519c92", "#4b9dad", "#76b6af"],
  ["#6869a4", "#789b86", "#7399ad", "#9f7da5"],
  ["#dd917c", "#b38f6d", "#8faaa4", "#deaa86"],
  ["#53547b", "#c7d2c0", "#b9d4df", "#725976"],
  ["#747093", "#edf0d9", "#e4f0f5", "#b28ba0"],
  ["#11162c", "#647e73", "#597f93", "#36273c"],
  ["#726084", "#adc3b2", "#a5c3d1", "#96718b"],
  ["#bd94af", "#e0e4ca", "#d4e8ed", "#d9a29e"],
  ["#42465f", "#8da899", "#83a8ba", "#664b64"],
  ["#191b38", "#74948b", "#6995a9", "#4b344c"],
  ["#15172f", "#6e887d", "#648b9e", "#442b44"],
  ["#1b1c38", "#91a592", "#87a8b6", "#46324a"],
  ["#9d5579", "#a4786c", "#8f939f", "#b16c7e"],
  ["#e58e86", "#d3a486", "#bfadb0", "#eaa28c"],
];

const recolors = new Map<StudioPeriod, Map<number, readonly number[]>>();
export function studioMaterial(color: string, period: StudioPeriod): string {
  if (period === "night") return color;
  const column = period === "morning" ? 1 : period === "day" ? 2 : 3;
  return MATERIAL_COLORS.find((row) => row[0] === color.toLowerCase())?.[column] ?? color;
}
export function recolorStudioPixels(pixels: Uint8ClampedArray, period: StudioPeriod): void {
  if (period === "night") return;
  let palette = recolors.get(period);
  if (!palette) {
    const column = period === "morning" ? 1 : period === "day" ? 2 : 3;
    palette = new Map(MATERIAL_COLORS.map((row) => {
      const rgb = parseInt(row[column].slice(1), 16);
      return [parseInt(row[0].slice(1), 16), [rgb >> 16, rgb >> 8 & 255, rgb & 255]];
    }));
    recolors.set(period, palette);
  }
  for (let i = 0; i < pixels.length; i += 4) {
    const color = palette.get(pixels[i] << 16 | pixels[i + 1] << 8 | pixels[i + 2]);
    if (color) { pixels[i] = color[0]; pixels[i + 1] = color[1]; pixels[i + 2] = color[2]; }
  }
}
