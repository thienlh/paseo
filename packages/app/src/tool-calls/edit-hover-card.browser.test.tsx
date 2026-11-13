import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { ToolCallDetail } from "@getpaseo/protocol/agent-types";
import { i18n } from "@/i18n/i18next";
import { EditPreview } from "./edit-hover-card";

const WRITE_DETAIL = {
  type: "write",
  filePath: "/repo/src/a.ts",
  content: "const answer = 42;\nconsole.log(answer);\n",
} as const satisfies Extract<ToolCallDetail, { type: "write" }>;

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root;
let host: HTMLDivElement;

beforeEach(async () => {
  await i18n.changeLanguage("en");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("previews written file content as highlighted additions", async () => {
  act(() => {
    root.render(<EditPreview detail={WRITE_DETAIL} path="src/a.ts" />);
  });

  await expect
    .poll(() => document.querySelector("[data-testid=diff-line-text]")?.textContent)
    .toBe("const answer = 42;");
  const lines = [...document.querySelectorAll("[data-testid=diff-line-text]")];
  expect(lines.map((line) => line.textContent)).toEqual([
    "const answer = 42;",
    "console.log(answer);",
  ]);
  expect(document.querySelectorAll("[data-testid=diff-add-indicator]")).toHaveLength(2);
  expect(document.body.textContent).toContain("+2");
  expect(document.body.textContent).toContain("-0");
});
