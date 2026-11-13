import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { i18n } from "@/i18n/i18next";
import type { DarkThemePreference } from "@/styles/theme";
import { PreferredDarkThemeRow } from "./theme-picker";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root;
let host: HTMLDivElement;
const changes: DarkThemePreference[] = [];

function recordChange(value: DarkThemePreference) {
  changes.push(value);
}

beforeEach(async () => {
  changes.length = 0;
  await i18n.changeLanguage("en");
  host = document.createElement("div");
  host.style.width = "480px";
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("offers every dark variant and reports the preferred selection", () => {
  act(() => {
    root.render(<PreferredDarkThemeRow value="dark" onChange={recordChange} />);
  });

  const trigger = host.querySelector<HTMLElement>("[aria-label='Preferred dark theme: Dark']")!;
  expect(trigger.textContent).toBe("Dark");
  act(() => trigger.click());

  const options = [...document.querySelectorAll("[data-testid^=preferred-dark-theme-option-]")];
  expect(options.map((option) => option.textContent)).toEqual([
    "Dark",
    "Zinc",
    "Midnight",
    "Claude",
    "Ghostty",
    "Pure black",
  ]);

  const pureBlack = document.querySelector("[data-testid=preferred-dark-theme-option-pureBlack]")!;
  act(() => pureBlack.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  expect(changes).toEqual(["pureBlack"]);
});
