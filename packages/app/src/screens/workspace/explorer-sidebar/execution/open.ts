import { showExplorerSidebar } from "@/workspace-tabs/explorer-sidebar";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { useExplorerExecutionStore } from "./state";

export function openExecutionTerminal(input: {
  workspaceKey: string;
  isCompact: boolean;
  terminalId: string;
  scriptName?: string;
}) {
  const execution = useExplorerExecutionStore.getState();
  const paneId = showExplorerSidebar(input);
  if (!paneId) return;
  if (input.scriptName)
    execution.dispatch(input.workspaceKey, { type: "script", name: input.scriptName });
  else execution.dispatch(input.workspaceKey, { type: "view", view: "run" });
  const tabId = useWorkspaceLayoutStore.getState().openTab({
    workspaceKey: input.workspaceKey,
    target: { kind: "terminal", terminalId: input.terminalId },
    intent: "reveal",
    placement: { mode: "pane", paneId },
  });
  if (tabId)
    execution.dispatch(input.workspaceKey, {
      type: "select",
      tabId,
      terminal: true,
      scriptName: input.scriptName ?? null,
    });
}
