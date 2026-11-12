import { useCallback, useMemo, useState, type ReactNode } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import { useIsCompactFormFactor } from "@/constants/layout";
import { isWeb } from "@/constants/platform";
import { useWorkspaceTabDrag } from "@/components/workspace-tab-drag-context";
import { StyleSheet } from "react-native-unistyles";
import { RetainedPanel } from "@/components/retained-panel";
import { TitlebarDragRegion } from "@/components/desktop/titlebar-drag-region";
import { WorkspacePanelHost } from "@/screens/workspace/workspace-panel-host";
import { deriveWorkspacePaneState } from "@/screens/workspace/workspace-pane-state";
import {
  WorkspaceDesktopTabsRow,
  type WorkspaceDesktopTabRowItem,
  type WorkspaceDesktopTabsRowProps,
} from "@/screens/workspace/workspace-desktop-tabs-row";
import type { WorkspacePaneContentModel } from "@/screens/workspace/workspace-pane-content";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";
import type { SplitPane } from "@/stores/workspace-layout-store";
import type { WorkspaceTab } from "@/workspace-tabs/model";
import { WindowChromeRegion, WindowChromeSafeArea } from "@/utils/desktop-window";
import { ExplorerExecution } from "./explorer-sidebar/execution";
import { useExplorerExecution } from "./explorer-sidebar/execution/use-execution";
import type { ExecutionControlsProps } from "./explorer-sidebar/execution/controls";
import type { TabDropPreview } from "@/components/split-container-tab-drop-preview";

interface ExplorerSidebarDockProps extends Pick<
  WorkspaceDesktopTabsRowProps,
  | "setHoveredCloseTabKey"
  | "onCopyResumeCommand"
  | "onCopyAgentId"
  | "onCopyTerminalId"
  | "onCopyFilePath"
  | "onReloadAgent"
  | "onRenameTab"
  | "onCreateNewTab"
  | "onExitFocusMode"
> {
  hoveredCloseTabKey: string | null;
  onCloseTabsToLeft: (tabId: string, tabs: WorkspaceTabDescriptor[]) => Promise<void> | void;
  onCloseTabsToRight: (tabId: string, tabs: WorkspaceTabDescriptor[]) => Promise<void> | void;
  onCloseOtherTabs: (tabId: string, tabs: WorkspaceTabDescriptor[]) => Promise<void> | void;
  pane: SplitPane;
  uiTabs: WorkspaceTab[];
  normalizedServerId: string;
  normalizedWorkspaceId: string;
  isWorkspaceFocused: boolean;
  paneFocusSuspended: boolean;
  closingTabIds: Set<string>;
  onSelectTab: (paneId: string, tabId: string) => void;
  onCloseTab: (tabId: string) => Promise<void> | void;
  onReorderTabsInPane: (paneId: string, tabIds: string[]) => void;
  buildPaneContentModel: (input: {
    paneId: string;
    tab: WorkspaceTabDescriptor;
  }) => WorkspacePaneContentModel;
  headerAction?: ReactNode;
  workspaceKey: string;
  executionControls: Omit<ExecutionControlsProps, "state" | "script" | "dispatch" | "compact">;
}

function explorerDropIndex(input: {
  preview: TabDropPreview | null;
  paneId: string;
  tabs: WorkspaceTabDescriptor[];
  draggedTab: WorkspaceTab | undefined;
  terminal: boolean;
}): number | null {
  if (!input.preview) return null;
  if (input.preview.paneId !== input.paneId) return null;
  if (!input.draggedTab) return null;
  const draggingTerminal = input.draggedTab.target.kind === "terminal";
  if (draggingTerminal !== input.terminal) return null;
  const before = input.tabs.slice(0, input.preview.indicatorIndex);
  return before.filter((tab) => (tab.kind === "terminal") === input.terminal).length;
}

/** Two presentation regions over one Explorer pane; every terminal mounts in only one host. */
export function ExplorerSidebarDock({
  pane,
  uiTabs,
  normalizedServerId,
  normalizedWorkspaceId,
  isWorkspaceFocused,
  paneFocusSuspended,
  closingTabIds,
  onSelectTab,
  onCloseTab,
  onCreateNewTab,
  hoveredCloseTabKey,
  setHoveredCloseTabKey,
  onCopyResumeCommand,
  onCopyAgentId,
  onCopyTerminalId,
  onCopyFilePath,
  onReloadAgent,
  onRenameTab,
  onCloseTabsToLeft,
  onCloseTabsToRight,
  onCloseOtherTabs,
  onExitFocusMode,
  onReorderTabsInPane,
  buildPaneContentModel,
  headerAction,
  workspaceKey,
  executionControls,
}: ExplorerSidebarDockProps) {
  const { activeDragTabId, tabDropPreview, externalDndContext } = useWorkspaceTabDrag();
  const paneState = useMemo(() => deriveWorkspacePaneState({ pane, tabs: uiTabs }), [pane, uiTabs]);
  const tabs = useMemo(() => paneState.tabs.map((tab) => tab.descriptor), [paneState.tabs]);
  const draggedTab = uiTabs.find((tab) => tab.tabId === activeDragTabId);
  const supportingDropIndex = explorerDropIndex({
    preview: tabDropPreview,
    paneId: pane.id,
    tabs,
    draggedTab,
    terminal: false,
  });
  const terminalDropIndex = explorerDropIndex({
    preview: tabDropPreview,
    paneId: pane.id,
    tabs,
    draggedTab,
    terminal: true,
  });
  const compact = useIsCompactFormFactor();
  const [availableHeight, setAvailableHeight] = useState(0);
  const measure = useCallback((event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    if (height > 0) setAvailableHeight(height);
  }, []);
  const handleSelectTab = useCallback(
    (tabId: string) => onSelectTab(pane.id, tabId),
    [onSelectTab, pane.id],
  );
  const execution = useExplorerExecution({
    workspaceKey,
    tabs,
    activeTabId: paneState.activeTabId,
    scripts: executionControls.scripts,
    onSelectTab: handleSelectTab,
  });
  const { supportingTabs, terminalTabs, supportingTabId, executionTabId, selectTab } = execution;
  const supportingVisible =
    !compact || !execution.state.expanded || execution.state.surface === "supporting";
  const executionVisible = !compact || execution.state.surface === "execution";
  const supportingFocused = !paneFocusSuspended && execution.state.surface === "supporting";
  const executionFocused = !paneFocusSuspended && execution.state.surface === "execution";
  const tabItems = useMemo<WorkspaceDesktopTabRowItem[]>(
    () =>
      supportingTabs.map((tab) => ({
        tab,
        isActive: tab.tabId === supportingTabId,
        isCloseHovered: hoveredCloseTabKey === tab.key,
        isClosingTab: closingTabIds.has(tab.tabId),
      })),
    [supportingTabId, closingTabIds, hoveredCloseTabKey, supportingTabs],
  );
  const terminalTabItems = useMemo<WorkspaceDesktopTabRowItem[]>(
    () =>
      terminalTabs.map((tab) => ({
        tab,
        isActive: tab.tabId === executionTabId,
        isCloseHovered: hoveredCloseTabKey === tab.key,
        isClosingTab: closingTabIds.has(tab.tabId),
      })),
    [closingTabIds, executionTabId, hoveredCloseTabKey, terminalTabs],
  );
  const handleReorderTabs = useCallback(
    (nextTabs: WorkspaceTabDescriptor[]) => {
      onReorderTabsInPane(
        pane.id,
        nextTabs.map((tab) => tab.tabId),
      );
    },
    [onReorderTabsInPane, pane.id],
  );

  const groupForTab = useCallback(
    (tabId: string) =>
      terminalTabs.some((tab) => tab.tabId === tabId) ? terminalTabs : supportingTabs,
    [supportingTabs, terminalTabs],
  );
  const handleCloseTabsToLeft = useCallback(
    (tabId: string) => onCloseTabsToLeft(tabId, groupForTab(tabId)),
    [onCloseTabsToLeft, groupForTab],
  );
  const handleCloseTabsToRight = useCallback(
    (tabId: string) => onCloseTabsToRight(tabId, groupForTab(tabId)),
    [onCloseTabsToRight, groupForTab],
  );
  const handleCloseOtherTabs = useCallback(
    (tabId: string) => onCloseOtherTabs(tabId, groupForTab(tabId)),
    [onCloseOtherTabs, groupForTab],
  );
  const focusSupporting = useCallback(() => {
    if (supportingTabId) selectTab(supportingTabId);
  }, [selectTab, supportingTabId]);
  const focusExecution = useCallback(() => {
    if (executionTabId) selectTab(executionTabId);
  }, [selectTab, executionTabId]);

  const tabRowProps = useMemo(
    () =>
      ({
        host: "explorer",
        launchPurpose: "supporting",
        isFocused: isWorkspaceFocused,
        ownsKeyboardShortcuts: false,
        setHoveredCloseTabKey,
        onCopyResumeCommand,
        onCopyAgentId,
        onCopyTerminalId,
        onCopyFilePath,
        onReloadAgent,
        onRenameTab,
        onCloseTabsToLeft: handleCloseTabsToLeft,
        onCloseTabsToRight: handleCloseTabsToRight,
        onCloseOtherTabs: handleCloseOtherTabs,
        focusModeEnabled: false,
        onExitFocusMode,
        externalDndContext,
        paneId: pane.id,
        normalizedServerId,
        normalizedWorkspaceId,
        activeDragTabId,
        onNavigateTab: selectTab,
        onCloseTab,
        onCreateNewTab,
        onReorderTabs: handleReorderTabs,
      }) satisfies Omit<WorkspaceDesktopTabsRowProps, "tabs">,
    [
      isWorkspaceFocused,
      setHoveredCloseTabKey,
      onCopyResumeCommand,
      onCopyAgentId,
      onCopyTerminalId,
      onCopyFilePath,
      onReloadAgent,
      onRenameTab,
      handleCloseTabsToLeft,
      handleCloseTabsToRight,
      handleCloseOtherTabs,
      onExitFocusMode,
      externalDndContext,
      pane.id,
      normalizedServerId,
      normalizedWorkspaceId,
      activeDragTabId,
      selectTab,
      onCloseTab,
      onCreateNewTab,
      handleReorderTabs,
    ],
  );

  const terminalTabRail = useMemo(
    () => (
      <WorkspaceDesktopTabsRow
        {...tabRowProps}
        tabs={terminalTabItems}
        showNewTabButton={false}
        tabDropPreviewIndex={terminalDropIndex}
      />
    ),
    [tabRowProps, terminalTabItems, terminalDropIndex],
  );

  return (
    <RetainedPanel active>
      <WindowChromeRegion corners="top-right">
        <View style={styles.dock} testID="workspace-explorer-sidebar">
          <WindowChromeSafeArea placement="inline" style={styles.tabRail}>
            <TitlebarDragRegion />
            <View style={styles.tabRow}>
              <WorkspaceDesktopTabsRow
                {...tabRowProps}
                tabs={tabItems}
                tabDropPreviewIndex={supportingDropIndex}
              />
            </View>
            {headerAction ? <View style={styles.headerAction}>{headerAction}</View> : null}
            <View pointerEvents="none" style={styles.tabRailDivider} />
          </WindowChromeSafeArea>
          <View style={styles.content} onLayout={measure}>
            <RetainedPanel active={supportingVisible}>
              <View
                style={styles.content}
                onTouchStart={focusSupporting}
                {...(isWeb ? { onPointerDown: focusSupporting } : {})}
              >
                <WorkspacePanelHost
                  paneId={pane.id}
                  tabs={supportingTabs}
                  activeTabId={supportingTabId}
                  normalizedServerId={normalizedServerId}
                  normalizedWorkspaceId={normalizedWorkspaceId}
                  isWorkspaceFocused={isWorkspaceFocused}
                  isPaneFocused={supportingFocused}
                  buildPaneContentModel={buildPaneContentModel}
                />
              </View>
            </RetainedPanel>
            <ExplorerExecution
              {...executionControls}
              state={execution.state}
              dispatch={execution.dispatch}
              script={execution.script}
              compact={compact}
              availableHeight={availableHeight}
              visible={executionVisible}
              hasTerminal={executionTabId !== null}
              onFocus={focusExecution}
              tabRail={terminalTabRail}
            >
              <WorkspacePanelHost
                paneId={pane.id}
                tabs={terminalTabs}
                activeTabId={executionTabId}
                normalizedServerId={normalizedServerId}
                normalizedWorkspaceId={normalizedWorkspaceId}
                isWorkspaceFocused={isWorkspaceFocused}
                isPaneFocused={executionFocused}
                buildPaneContentModel={buildPaneContentModel}
              />
            </ExplorerExecution>
          </View>
        </View>
      </WindowChromeRegion>
    </RetainedPanel>
  );
}

const styles = StyleSheet.create((theme) => ({
  dock: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    backgroundColor: theme.colors.surfaceSidebar,
  },
  tabRail: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    backgroundColor: theme.colors.surfaceSidebar,
  },
  tabRow: {
    flex: 1,
    minWidth: 0,
  },
  headerAction: {
    marginRight: theme.spacing[1],
  },
  tabRailDivider: {
    position: "absolute",
    right: 0,
    bottom: 0,
    left: 0,
    height: theme.borderWidth[1],
    backgroundColor: theme.colors.border,
  },
  content: {
    flex: 1,
    minHeight: 0,
    backgroundColor: theme.colors.surfaceSidebar,
  },
}));
