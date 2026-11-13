/** Electron reports the macOS accent as `#RRGGBB` or `#RRGGBBAA`. */
export function normalizeSystemAccentColor(value: string | null | undefined): string | null {
  if (!value) return null;
  const hex = value.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]+$/.test(hex)) return null;
  if (hex.length !== 6 && hex.length !== 8) return null;
  return `#${hex.slice(0, 6).toLowerCase()}`;
}

/** Dark text on a light accent, white text on a dark one. */
export function accentTextColor(accent: string): string {
  return relativeLuminance(accent) > 0.55 ? "#1a1a1e" : "#ffffff";
}

export function accentBrightColor(accent: string, colorScheme: "light" | "dark"): string {
  const towardWhite = colorScheme === "dark" ? 0.42 : 0.18;
  return mixHex(accent, "#ffffff", towardWhite);
}

export function applySystemAccentColors<T extends Record<string, unknown>>(
  colors: T,
  rawAccent: string,
  colorScheme: "light" | "dark",
): T {
  const accent = normalizeSystemAccentColor(rawAccent);
  if (!accent) return colors;
  const accentForeground = accentTextColor(accent);
  return {
    ...colors,
    accent,
    accentBright: accentBrightColor(accent, colorScheme),
    accentForeground,
    success: accent,
    successForeground: accentForeground,
  };
}

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function mixHex(from: string, to: string, amount: number): string {
  const mix = (offset: number) => {
    const start = Number.parseInt(from.slice(offset, offset + 2), 16);
    const end = Number.parseInt(to.slice(offset, offset + 2), 16);
    return Math.round(start + (end - start) * amount);
  };
  return `#${[1, 3, 5].map((offset) => mix(offset).toString(16).padStart(2, "0")).join("")}`;
}
