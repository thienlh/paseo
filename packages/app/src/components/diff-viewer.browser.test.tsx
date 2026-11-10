import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { i18n } from "@/i18n/i18next";
import type { DiffLine } from "@/utils/tool-call-parsers";
import { DiffViewer } from "./diff-viewer";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root;
let host: HTMLDivElement;

beforeEach(async () => {
  await i18n.changeLanguage("en");
  host = document.createElement("div");
  host.style.width = "320px";
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  act(() => root.unmount());
  host.remove();
  await i18n.changeLanguage("en");
});

function render(lines: DiffLine[]) {
  act(() => root.render(<DiffViewer diffLines={lines} />));
}

function click(element: Element) {
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function lineNumbers(side: "old" | "new"): string[] {
  return [...host.querySelectorAll(`[data-testid=diff-${side}-line-number]`)].map(
    (element) => element.textContent ?? "",
  );
}

it("collapses large unmodified blocks and shows hunk line numbers when expanded", () => {
  const context = { type: "context", content: " const value = true;" } as const;
  render([
    { type: "header", content: "@@ -50,4 +50,4 @@" },
    ...Array.from({ length: 7 }, () => context),
    { type: "remove", content: "-const old = true;" },
    { type: "add", content: "+const old = false;" },
  ]);

  const toggle = host.querySelector("[data-testid=diff-unmodified-toggle]")!;
  expect(toggle.textContent).toBe("7 unmodified lines");
  expect(host.textContent).not.toContain("const value = true");
  expect(lineNumbers("old")).toEqual(["", "57", ""]);
  expect(lineNumbers("new")).toEqual(["", "", "57"]);

  click(toggle);
  expect(host.textContent).toContain("const value = true");
  expect(lineNumbers("old")).toEqual(["", "50", "51", "52", "53", "54", "55", "56", "57", ""]);
  expect(lineNumbers("new")).toEqual(["", "50", "51", "52", "53", "54", "55", "56", "", "57"]);
});

it("wraps long lines inside the preview instead of overflowing it", () => {
  host.style.width = "240px";
  render([{ type: "add", content: `+${"x".repeat(200)}` }]);
  const text = host.querySelector("[data-testid=diff-line-text]")!;
  const range = document.createRange();
  range.selectNode(text.firstChild ?? text);

  expect(range.getClientRects().length).toBeGreaterThan(1);
  expect(text.scrollWidth).toBeLessThanOrEqual(text.clientWidth);
});
