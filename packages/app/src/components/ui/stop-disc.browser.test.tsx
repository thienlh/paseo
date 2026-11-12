import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StopDisc } from "./stop-disc";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("React", React);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it("uses the theme foreground for the stop glyph fill", () => {
  act(() => root.render(<StopDisc size={28} glyphSize={12} />));

  const glyph = host.querySelector("rect");
  expect(glyph?.getAttribute("fill")).toBe(glyph?.getAttribute("stroke"));
  expect(glyph?.getAttribute("fill")).not.toBe("currentColor");
  expect(glyph?.getAttribute("fill")).not.toBe("");
});
