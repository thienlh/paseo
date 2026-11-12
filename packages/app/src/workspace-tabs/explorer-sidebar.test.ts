import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  },
}));

import { usePanelStore } from "@/stores/panel-store";
import {
  DEFAULT_EXECUTION_STATE,
  reduceExecutionState,
  resolveExecutionHeight,
} from "@/screens/workspace/explorer-sidebar/execution/state";
import {
  collectAllTabs,
  findPaneById,
  selectExplorerSidebarPaneId,
  useWorkspaceLayoutStore,
} from "@/stores/workspace-layout-store";
import {
  isExplorerSidebarOpen,
  openExplorerSidebarView,
  resolveExplorerSidebarPresentation,
  toggleExplorerSidebar,
} from "@/workspace-tabs/explorer-sidebar";

const WORKSPACE_KEY = "server-1:ws-main";

describe("Explorer execution", () => {
  it("preserves the supporting view and selected terminal while collapsing", () => {
    const files = reduceExecutionState(DEFAULT_EXECUTION_STATE, {
      type: "observe",
      tabId: "files",
      terminal: false,
      scriptName: null,
    });
    const running = reduceExecutionState(files, {
      type: "observe",
      tabId: "terminal-1",
      terminal: true,
      scriptName: "dev",
    });
    const collapsed = reduceExecutionState(running, { type: "toggle" });
    expect(collapsed).toEqual({
      ...DEFAULT_EXECUTION_STATE,
      supportingTabId: "files",
      terminalTabId: "terminal-1",
      observedTabId: "terminal-1",
      scriptName: "dev",
    });
    expect(
      reduceExecutionState(collapsed, {
        type: "observe",
        tabId: "terminal-1",
        terminal: true,
        scriptName: "dev",
      }),
    ).toBe(collapsed);
    expect(reduceExecutionState(collapsed, { type: "view", view: "run" })).toEqual({
      ...collapsed,
      expanded: true,
      surface: "execution",
    });
  });

  it("returns to review on compact without forgetting the expanded execution area", () => {
    const running = reduceExecutionState(DEFAULT_EXECUTION_STATE, {
      type: "view",
      view: "terminal",
    });
    const review = reduceExecutionState(running, {
      type: "select",
      tabId: "changes_tree",
      terminal: false,
      scriptName: null,
    });
    expect(review.surface).toBe("supporting");
    expect(review.expanded).toBe(true);
    expect(review.view).toBe("terminal");
  });

  it("preserves the height across hidden measurements and clamps only rendered geometry", () => {
    expect(resolveExecutionHeight({ requested: 420, available: 0 })).toBe(420);
    expect(resolveExecutionHeight({ requested: 420, available: 500 })).toBe(320);
    expect(resolveExecutionHeight({ requested: 420, available: 900 })).toBe(420);
    expect(resolveExecutionHeight({ requested: 10, available: 900 })).toBe(160);
  });
});

beforeEach(() => {
  useWorkspaceLayoutStore.setState({
    layoutByWorkspace: {},
    explorerSidebarPaneIdByWorkspace: {},
    sidePaneIdByWorkspace: {},
    splitSizesByWorkspace: {},
  });
  usePanelStore.setState({
    mobilePanel: { target: "agent", revision: 0 },
  });
});

describe("Explorer sidebar", () => {
  it("selects the Explorer shell from the form factor", () => {
    expect(resolveExplorerSidebarPresentation({ isCompact: true })).toBe("overlay");
    expect(resolveExplorerSidebarPresentation({ isCompact: false })).toBe("dock");
  });

  it("uses the same Explorer pane inside the compact overlay", () => {
    openExplorerSidebarView({
      isCompact: true,
      workspaceKey: WORKSPACE_KEY,
      view: "changes",
    });

    expect(usePanelStore.getState().mobilePanel.target).toBe("file-explorer");
    const state = useWorkspaceLayoutStore.getState();
    const layout = state.layoutByWorkspace[WORKSPACE_KEY];
    const pane = findPaneById(layout.root, selectExplorerSidebarPaneId(state, WORKSPACE_KEY)!);
    expect(
      collectAllTabs(layout.root).find((tab) => tab.tabId === pane?.focusedTabId)?.target.kind,
    ).toBe("changes_tree");
  });

  it("creates a dedicated desktop Explorer containing only its requested tree", () => {
    openExplorerSidebarView({
      isCompact: false,
      workspaceKey: WORKSPACE_KEY,
      view: "files",
    });

    const state = useWorkspaceLayoutStore.getState();
    const layout = state.layoutByWorkspace[WORKSPACE_KEY];
    const paneId = selectExplorerSidebarPaneId(state, WORKSPACE_KEY);
    expect(paneId).not.toBeNull();
    expect(layout && collectAllTabs(layout.root).map((tab) => tab.target.kind)).toContain("files");
  });

  it("toggles the desktop Explorer independently of ordinary panes", () => {
    const input = {
      isCompact: false,
      workspaceKey: WORKSPACE_KEY,
    };
    openExplorerSidebarView({ ...input, view: "files" });
    toggleExplorerSidebar(input);
    expect(isExplorerSidebarOpen(input)).toBe(false);
    toggleExplorerSidebar(input);
    expect(isExplorerSidebarOpen(input)).toBe(true);
    const openedState = useWorkspaceLayoutStore.getState();
    const openedLayout = openedState.layoutByWorkspace[WORKSPACE_KEY];
    const explorerPaneId = selectExplorerSidebarPaneId(openedState, WORKSPACE_KEY);
    const explorerPane =
      openedLayout && explorerPaneId ? findPaneById(openedLayout.root, explorerPaneId) : null;
    const activeExplorerTarget =
      openedLayout && explorerPane
        ? collectAllTabs(openedLayout.root).find((tab) => tab.tabId === explorerPane.focusedTabId)
            ?.target.kind
        : null;
    expect(activeExplorerTarget).toBe("files");
  });

  it("toggles the compact Explorer without changing its selected view", () => {
    const input = {
      isCompact: true,
      workspaceKey: WORKSPACE_KEY,
    };

    toggleExplorerSidebar(input);

    expect(isExplorerSidebarOpen(input)).toBe(true);
  });
});
