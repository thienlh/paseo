import { describe, expect, it } from "vitest";
import { i18n } from "@/i18n/i18next";
import type { SidebarWorkspaceEntry } from "@/hooks/use-sidebar-workspaces-list";
import { selectSidebarRunningScriptNames, sidebarRunningScriptLabel } from "./running-script";

type Script = SidebarWorkspaceEntry["scripts"][number];

function script(overrides: Partial<Script>): Script {
  return {
    scriptName: "run",
    type: "script",
    hostname: "run",
    port: null,
    proxyUrl: null,
    lifecycle: "running",
    health: null,
    exitCode: null,
    terminalId: null,
    ...overrides,
  } as Script;
}

describe("selectSidebarRunningScriptNames", () => {
  it("returns nothing when every script is stopped", () => {
    expect(selectSidebarRunningScriptNames([script({ lifecycle: "stopped" })])).toEqual([]);
  });

  it("names a running script", () => {
    expect(selectSidebarRunningScriptNames([script({ scriptName: "run" })])).toEqual(["run"]);
  });

  it("leaves services to the meta line", () => {
    expect(
      selectSidebarRunningScriptNames([
        script({ scriptName: "web", type: "service" }),
        script({ scriptName: "run" }),
      ]),
    ).toEqual(["run"]);
  });

  it("keeps every running script in list order", () => {
    expect(
      selectSidebarRunningScriptNames([
        script({ scriptName: "lint", lifecycle: "stopped" }),
        script({ scriptName: "run" }),
        script({ scriptName: "typecheck" }),
      ]),
    ).toEqual(["run", "typecheck"]);
  });
});

describe("sidebarRunningScriptLabel", () => {
  it("returns nothing when nothing is running", () => {
    expect(sidebarRunningScriptLabel([], i18n.t)).toBeNull();
  });

  it("names the one running script", () => {
    expect(sidebarRunningScriptLabel(["run"], i18n.t)).toBe("run script");
  });

  it("counts several running scripts", () => {
    expect(sidebarRunningScriptLabel(["run", "typecheck"], i18n.t)).toBe("2 running");
  });
});
