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

function lineNumbers(): string[] {
  return [...host.querySelectorAll("[data-testid=diff-line-number]")].map(
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
  expect(lineNumbers()).toEqual(["", "57", "57"]);

  click(toggle);
  expect(host.textContent).toContain("const value = true");
  expect(lineNumbers()).toEqual(["", "50", "51", "52", "53", "54", "55", "56", "57", "57"]);
});

it("uses colored rails and one relevant line number instead of diff prefixes", () => {
  render([
    { type: "remove", content: "-const old = true;" },
    { type: "add", content: "+const old = false;" },
  ]);

  const lines = [...host.querySelectorAll("[data-testid=diff-line-text]")];
  expect(lines.map((line) => line.textContent)).toEqual([
    "const old = true;",
    "const old = false;",
  ]);
  expect(lineNumbers()).toEqual(["1", "1"]);
  expect(getComputedStyle(host.querySelector("[data-testid=diff-remove-indicator]")!).width).toBe(
    "3px",
  );
  expect(
    getComputedStyle(host.querySelector("[data-testid=diff-add-indicator]")!).backgroundColor,
  ).not.toBe("rgba(0, 0, 0, 0)");
});

it("keeps inline change highlights when syntax tokens are present", () => {
  render([
    {
      type: "add",
      content: "+const answer = 42;",
      segments: [
        { text: "const answer = ", changed: false },
        { text: "42;", changed: true },
      ],
      tokens: [
        { text: "const", style: "keyword" },
        { text: " answer = ", style: null },
        { text: "42", style: "number" },
        { text: ";", style: null },
      ],
    },
  ]);

  const changed = host.querySelector("[data-testid=diff-changed-segment]");
  expect(changed?.textContent).toBe("42;");
  expect(getComputedStyle(changed!).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  const syntaxToken = changed!.querySelector("[data-testid=diff-syntax-token]");
  expect(getComputedStyle(syntaxToken!).color).toBe("rgb(5, 80, 174)");
  expect(host.querySelector("[data-testid=diff-line-text]")?.textContent).toBe(
    "const answer = 42;",
  );
});

it("renders no-newline markers as subdued metadata", () => {
  render([
    { type: "remove", content: "-const old = true;" },
    { type: "header", content: "\\ No newline at end of file" },
  ]);

  const lines = [...host.querySelectorAll("[data-testid=diff-line-text]")];
  expect(lines.map((line) => line.textContent)).toEqual([
    "const old = true;",
    "No newline at end of file",
  ]);
  expect(getComputedStyle(lines[1]!).color).toBe("rgb(102, 102, 102)");
});

it("wraps highlighted inline segments without overflowing the preview", () => {
  host.style.width = "240px";
  const text = "x".repeat(200);
  render([
    {
      type: "add",
      content: `+${text}`,
      segments: [
        { text: text.slice(0, 100), changed: false },
        { text: text.slice(100), changed: true },
      ],
      tokens: [{ text, style: null }],
    },
  ]);

  const line = host.querySelector("[data-testid=diff-line-text]")!;
  const lineNumber = host.querySelector("[data-testid=diff-line-number]")!;
  expect(line.getBoundingClientRect().height).toBeGreaterThan(
    lineNumber.getBoundingClientRect().height,
  );
  expect(line.scrollWidth).toBeLessThanOrEqual(line.clientWidth);
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
