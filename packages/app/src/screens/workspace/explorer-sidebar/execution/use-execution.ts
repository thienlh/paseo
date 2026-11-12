import { useCallback, useLayoutEffect, useMemo } from "react";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";
import type { WorkspaceDescriptor } from "@/stores/session-store";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { DEFAULT_EXECUTION_STATE, useExplorerExecutionStore, type ExecutionEvent } from "./state";

export function useExplorerExecution({
  workspaceKey,
  tabs,
  activeTabId,
  scripts,
  onSelectTab,
}: {
  workspaceKey: string;
  tabs: WorkspaceTabDescriptor[];
  activeTabId: string | null;
  scripts: WorkspaceDescriptor["scripts"];
  onSelectTab: (tabId: string) => void;
}) {
  const state = useExplorerExecutionStore(
    (store) => store.byWorkspace[workspaceKey] ?? DEFAULT_EXECUTION_STATE,
  );
  const send = useExplorerExecutionStore((store) => store.dispatch);
  const requestedTabId = useWorkspaceLayoutStore((store) => {
    const request = store.focusRequest;
    return request?.workspaceKey === workspaceKey ? request.tabId : null;
  });
  const dispatch = useCallback(
    (event: ExecutionEvent) => send(workspaceKey, event),
    [send, workspaceKey],
  );
  const supportingTabs = useMemo(() => tabs.filter((tab) => tab.kind !== "terminal"), [tabs]);
  const terminalTabs = useMemo(() => tabs.filter((tab) => tab.kind === "terminal"), [tabs]);
  const observeTab = useCallback(
    (tab: WorkspaceTabDescriptor, type: "select" | "observe") => {
      const target = tab.target;
      const script =
        target.kind === "terminal"
          ? scripts.find((entry) => entry.terminalId === target.terminalId)
          : null;
      dispatch({
        type,
        tabId: tab.tabId,
        terminal: target.kind === "terminal",
        scriptName: script?.scriptName ?? null,
      });
    },
    [dispatch, scripts],
  );

  // Menus and drag/drop can change the pane's selection outside this shell. Record that
  // navigation while the two visible regions keep their own last selected tab.
  useLayoutEffect(() => {
    const wasExecution = state.surface === "execution" && state.observedTabId !== null;
    const previousRemoved = wasExecution && !tabs.some((tab) => tab.tabId === state.observedTabId);
    const passiveFallback = requestedTabId !== activeTabId;
    // A finished process removes its terminal tab. Its fallback selection must
    // not take a compact user away from Run's exit status and rerun action.
    if (previousRemoved && passiveFallback) return;
    const active = tabs.find((tab) => tab.tabId === activeTabId);
    if (active) observeTab(active, "observe");
  }, [activeTabId, observeTab, requestedTabId, state.observedTabId, state.surface, tabs]);

  const selectTab = useCallback(
    (tabId: string) => {
      const tab = tabs.find((entry) => entry.tabId === tabId);
      if (!tab) return;
      observeTab(tab, "select");
      onSelectTab(tabId);
    },
    [observeTab, onSelectTab, tabs],
  );
  const supportingTab =
    supportingTabs.find((tab) => tab.tabId === activeTabId) ??
    supportingTabs.find((tab) => tab.tabId === state.supportingTabId) ??
    supportingTabs[0] ??
    null;
  const script =
    scripts.find((entry) => entry.scriptName === state.scriptName) ?? scripts[0] ?? null;
  const selectedTerminal =
    terminalTabs.find((tab) => tab.tabId === state.terminalTabId) ?? terminalTabs[0] ?? null;
  const scriptTerminal =
    terminalTabs.find(
      (tab) => tab.target.kind === "terminal" && tab.target.terminalId === script?.terminalId,
    ) ?? null;
  const executionTab = state.view === "run" ? scriptTerminal : selectedTerminal;
  return {
    state,
    dispatch,
    selectTab,
    script,
    supportingTabs,
    terminalTabs,
    supportingTabId: supportingTab?.tabId ?? null,
    executionTabId: executionTab?.tabId ?? null,
  };
}
