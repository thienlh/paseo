import { describe, expect, it } from "vitest";
import {
  accentTextColor,
  applySystemAccentColors,
  normalizeSystemAccentColor,
} from "./system-accent";

describe("normalizeSystemAccentColor", () => {
  it("reads Electron's #RRGGBBAA macOS accent as RGB", () => {
    expect(normalizeSystemAccentColor("#007AFFFF")).toBe("#007aff");
  });

  it("accepts a plain #RRGGBB color", () => {
    expect(normalizeSystemAccentColor("007aff")).toBe("#007aff");
  });

  it("rejects a color that is not hex", () => {
    expect(normalizeSystemAccentColor("blue")).toBeNull();
    expect(normalizeSystemAccentColor("#fff")).toBeNull();
  });
});

describe("accentTextColor", () => {
  it("uses white text on the blue system accent", () => {
    expect(accentTextColor("#007aff")).toBe("#ffffff");
  });

  it("uses dark text on the yellow system accent", () => {
    expect(accentTextColor("#ffd60a")).toBe("#1a1a1e");
  });
});

describe("applySystemAccentColors", () => {
  it("replaces the theme accent and the success alias", () => {
    const colors = applySystemAccentColors(
      {
        accent: "#20744A",
        accentForeground: "#000000",
        success: "#20744A",
        surface0: "#ffffff",
      },
      "#007AFFFF",
      "light",
    );

    expect(colors.accent).toBe("#007aff");
    expect(colors.success).toBe("#007aff");
    expect(colors.accentForeground).toBe("#ffffff");
    expect(colors.surface0).toBe("#ffffff");
  });

  it("leaves the theme accent alone when the system color is unusable", () => {
    const colors = { accent: "#20744A" };
    expect(applySystemAccentColors(colors, "nope", "dark")).toBe(colors);
  });
});
