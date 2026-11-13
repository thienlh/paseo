import type { TFunction } from "i18next";
import type { SidebarWorkspaceEntry } from "@/hooks/use-sidebar-workspaces-list";

type WorkspaceScript = SidebarWorkspaceEntry["scripts"][number];

/**
 * Names of the plain scripts a workspace is running, in list order.
 *
 * Services stay on the meta line, where health is the thing worth reporting. A plain script
 * has no health and used to be invisible from the sidebar, so the title row is where its name
 * shows up while it runs.
 */
export function selectSidebarRunningScriptNames(scripts: readonly WorkspaceScript[]): string[] {
  const names: string[] = [];
  for (const script of scripts) {
    if (script.lifecycle !== "running") continue;
    if ((script.type ?? "service") === "service") continue;
    names.push(script.scriptName);
  }
  return names;
}

/** What the row says out loud for those names. One script keeps its name; several become a count. */
export function sidebarRunningScriptLabel(names: readonly string[], t: TFunction): string | null {
  const [only] = names;
  if (!only) return null;
  if (names.length === 1) {
    return t("workspace.scripts.accessibility.script", { scriptName: only });
  }
  return t("workspace.scripts.states.runningCount", { count: names.length });
}
