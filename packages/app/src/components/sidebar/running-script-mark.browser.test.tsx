import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { RunningScriptMark } from "./running-script-mark";

interface Mounted {
  root: Root;
  container: HTMLDivElement;
}

const mounted: Mounted[] = [];

function mount(names: string[]): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<RunningScriptMark names={names} />));
  mounted.push({ root, container });
  const mark = container.querySelector("[data-testid=sidebar-running-script]");
  if (!(mark instanceof HTMLElement)) {
    throw new Error("RunningScriptMark did not render");
  }
  return mark;
}

afterEach(() => {
  for (const entry of mounted.splice(0)) {
    act(() => entry.root.unmount());
    entry.container.remove();
  }
});

describe("RunningScriptMark", () => {
  it("shows the running script name beside the activity bars", () => {
    const mark = mount(["run"]);

    expect(mark.textContent).toContain("run");
    expect(mark.querySelector("[data-testid=explorer-run-activity]")).not.toBeNull();
  });
});
