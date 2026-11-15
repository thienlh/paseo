import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Text, View, type PressableStateCallbackType } from "react-native";
import { ScrollView } from "@/components/ui/scroll-view";
import { PressHighlight } from "@/components/ui/press-highlight";
import { isWeb } from "@/constants/platform";
import { ChevronDown, ChevronUp, Play, Plus, Square, Globe } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ToolbarButton } from "@/components/ui/pane-content-toolbar";
import { HEADER_CONTROL_HEIGHT } from "@/components/ui/control-geometry";
import { WORKSPACE_SECONDARY_HEADER_HEIGHT } from "@/constants/layout";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { extraMutedIconColorMapping } from "@/components/ui/icon-color";
import { smallIconButtonChromeFrameSize } from "@/components/ui/icon-button-chrome";
import { SPACING } from "@/styles/theme";
import type { WorkspaceDescriptor } from "@/stores/session-store";
import type { WorkspaceScriptActions } from "@/screens/workspace/scripts/use-workspace-script-actions";
import { ExitCodeBadge, ScriptIcon } from "@/screens/workspace/scripts/script-marks";
import { openServiceUrl } from "@/utils/open-service-url";
import type { ExecutionEvent, ExplorerExecutionState } from "./state";
import { RunActivity } from "./run-activity";

export type WorkspaceScript = WorkspaceDescriptor["scripts"][number];

export interface ExecutionControlsProps {
  state: ExplorerExecutionState;
  script: WorkspaceScript | null;
  scripts: WorkspaceDescriptor["scripts"];
  actions: WorkspaceScriptActions;
  connected: boolean;
  creatingTerminal: boolean;
  compact: boolean;
  dispatch: (event: ExecutionEvent) => void;
  onViewTerminal: (terminalId: string) => void;
  onCreateTerminal: () => void;
  onOpenUrl: (url: string) => void;
  onConfigureScripts?: () => void;
}

const TOGGLE_GLYPH_SIZE = 16;

const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedChevronUp = withUnistyles(ChevronUp);
const ThemedPlus = withUnistyles(Plus);
const ThemedRunActivity = withUnistyles(RunActivity, (theme) => ({
  color: theme.colors.foregroundMuted,
}));

interface ExecutionTabProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
  children?: ReactNode;
}

/** A view chip in the workspace tab language: the sidebar rail's hover and selected fills. */
function ExecutionTab({ label, selected, onPress, testID, children }: ExecutionTabProps) {
  const [hovered, setHovered] = useState(false);
  const accessibilityState = useMemo(() => ({ selected }), [selected]);
  const tabStyle = useCallback(
    ({ pressed }: PressableStateCallbackType) => [
      styles.tab,
      (hovered || pressed) && styles.tabHover,
      selected && styles.tabSelected,
    ],
    [hovered, selected],
  );
  const handleHoverIn = useCallback(() => setHovered(true), []);
  const handleHoverOut = useCallback(() => setHovered(false), []);
  return (
    <PressHighlight
      style={tabStyle}
      highlightStyle={styles.tabHover}
      onPress={onPress}
      onHoverIn={handleHoverIn}
      onHoverOut={handleHoverOut}
      accessibilityRole="tab"
      accessibilityState={accessibilityState}
      aria-selected={selected}
      testID={testID}
    >
      {children}
      <Text
        style={[styles.tabText, (selected || hovered) && styles.tabTextActive]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </PressHighlight>
  );
}

export function ExecutionControls(props: ExecutionControlsProps) {
  const { t } = useTranslation();
  const {
    state,
    compact,
    dispatch,
    connected,
    creatingTerminal,
    onCreateTerminal,
    script,
    onViewTerminal,
    scripts,
  } = props;
  const running = scripts.some((entry) => entry.lifecycle === "running");
  const selectView = useCallback(
    (view: ExplorerExecutionState["view"] | "") => {
      if (!view) return;
      dispatch({ type: "view", view });
      const showRunningOutput = view === "run" && script?.lifecycle === "running";
      if (showRunningOutput && script.terminalId) onViewTerminal(script.terminalId);
    },
    [dispatch, onViewTerminal, script],
  );
  const toggle = useCallback(() => {
    dispatch({ type: "toggle" });
    const revealRun = !state.expanded && state.view === "run";
    const terminalId = script?.lifecycle === "running" ? script.terminalId : null;
    if (revealRun && terminalId !== null) onViewTerminal(terminalId);
  }, [dispatch, onViewTerminal, script, state.expanded, state.view]);
  const executionVisible = state.expanded && (!compact || state.surface === "execution");
  const selectedView = executionVisible ? state.view : "";
  const selectRun = useCallback(() => selectView("run"), [selectView]);
  const selectTerminal = useCallback(() => selectView("terminal"), [selectView]);
  const terminalDisabled = !connected || creatingTerminal;
  const accessibilityState = useMemo(() => ({ expanded: state.expanded }), [state.expanded]);
  // The glyph sits on the dock's icon rail and the first tab label on its text rail; the hit
  // area overhangs into the header padding.
  const toggleStyle = useMemo(
    () => ({
      marginLeft: -(smallIconButtonChromeFrameSize(compact) - TOGGLE_GLYPH_SIZE) / 2,
      marginRight: SPACING[0.5],
    }),
    [compact],
  );
  const toggleLabel = state.expanded
    ? t("workspace.tabs.explorerSidebar.execution.collapse")
    : t("workspace.tabs.explorerSidebar.execution.expand");
  return (
    <View style={styles.header} testID="explorer-execution-header">
      <ToolbarButton
        label={toggleLabel}
        compact={compact}
        onPress={toggle}
        testID="explorer-execution-toggle"
        accessibilityState={accessibilityState}
        style={toggleStyle}
      >
        {state.expanded ? (
          <ThemedChevronDown size={TOGGLE_GLYPH_SIZE} uniProps={extraMutedIconColorMapping} />
        ) : (
          <ThemedChevronUp size={TOGGLE_GLYPH_SIZE} uniProps={extraMutedIconColorMapping} />
        )}
      </ToolbarButton>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabs}
        contentContainerStyle={styles.tabTrack}
      >
        <View style={styles.tabRow}>
          <ExecutionTab
            label={t("workspace.scripts.actions.run")}
            selected={selectedView === "run"}
            onPress={selectRun}
            testID="explorer-execution-run-view"
          >
            {running ? <ThemedRunActivity running connected={connected} size={12} /> : null}
          </ExecutionTab>
          <ExecutionTab
            label={t("workspace.tabs.fallback.terminal")}
            selected={selectedView === "terminal"}
            onPress={selectTerminal}
            testID="explorer-execution-terminal-view"
          />
          <ToolbarButton
            label={t("workspace.tabs.actions.newTerminal")}
            compact={compact}
            onPress={onCreateTerminal}
            disabled={terminalDisabled}
            testID="explorer-execution-new-terminal"
          >
            <ThemedPlus size={16} uniProps={extraMutedIconColorMapping} />
          </ToolbarButton>
        </View>
      </ScrollView>
      <View style={styles.actions}>
        <ExecutionServiceButton {...props} />
        <View style={styles.runControl}>
          <RunButton {...props} />
          <ExecutionScriptPicker {...props} />
        </View>
      </View>
    </View>
  );
}

function RunButton({ script, actions, connected, dispatch }: ExecutionControlsProps) {
  const { t } = useTranslation();
  const running = script?.lifecycle === "running";
  const pending = running ? actions.isStopPending : actions.isStartPending;
  const disabled = !script || !connected || pending;
  const label = running ? t("workspace.scripts.actions.stop") : t("workspace.scripts.actions.run");
  const handlePress = useCallback(() => {
    if (!script) return;
    dispatch({ type: "script", name: script.scriptName });
    if (running) actions.stop(script.scriptName);
    else actions.start(script.scriptName);
  }, [actions, dispatch, running, script]);
  return (
    <Button
      variant="outline"
      size="sm"
      leftIcon={running ? Square : Play}
      loading={pending}
      disabled={disabled}
      onPress={handlePress}
      style={styles.runButton}
      textStyle={styles.actionText}
      testID="explorer-execution-run"
    >
      {label}
    </Button>
  );
}

function ExecutionServiceButton({ script, actions, onOpenUrl }: ExecutionControlsProps) {
  const { t } = useTranslation();
  const selectedLink = script ? actions.resolveLinks(script).selected : null;
  const open = useCallback(() => {
    if (selectedLink) void openServiceUrl(selectedLink.url, { openInApp: onOpenUrl });
  }, [onOpenUrl, selectedLink]);
  if (!script || !selectedLink) return null;
  const label = script.port === null ? selectedLink.label : `:${script.port}`;
  return (
    <Button
      variant="outline"
      size="sm"
      leftIcon={Globe}
      onPress={open}
      style={styles.actionButton}
      textStyle={styles.actionText}
      accessibilityLabel={t("workspace.scripts.accessibility.openService", {
        scriptName: script.scriptName,
      })}
      testID="explorer-execution-open-service"
    >
      {label}
    </Button>
  );
}

function ExecutionScriptPicker({
  script,
  scripts,
  dispatch,
  onViewTerminal,
  compact,
}: ExecutionControlsProps) {
  const { t } = useTranslation();
  if (!script) return null;
  return (
    <DropdownMenu>
      <ToolbarButton
        kind="menu"
        compact={compact}
        testID="explorer-execution-script-picker"
        label={`${t("workspace.tabs.explorerSidebar.execution.chooseScript")}: ${script.scriptName}`}
        style={styles.runCaret}
      >
        <ThemedChevronDown size={14} uniProps={extraMutedIconColorMapping} />
      </ToolbarButton>
      <DropdownMenuContent align="end" width={240}>
        {scripts.map((entry) => (
          <ScriptOption
            key={entry.scriptName}
            script={entry}
            selected={entry.scriptName === script.scriptName}
            dispatch={dispatch}
            onViewTerminal={onViewTerminal}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ScriptOption({
  script,
  selected,
  dispatch,
  onViewTerminal,
}: {
  script: WorkspaceScript;
  selected: boolean;
  dispatch: ExecutionControlsProps["dispatch"];
  onViewTerminal: ExecutionControlsProps["onViewTerminal"];
}) {
  const leading = useMemo(() => <ScriptIcon script={script} size={14} />, [script]);
  const trailing = useMemo(
    () => (script.exitCode === null ? undefined : <ExitCodeBadge code={script.exitCode} />),
    [script.exitCode],
  );
  const select = useCallback(() => {
    dispatch({ type: "script", name: script.scriptName });
    const terminalId = script.lifecycle === "running" ? script.terminalId : null;
    if (terminalId !== null) onViewTerminal(terminalId);
  }, [dispatch, onViewTerminal, script]);
  return (
    <DropdownMenuItem
      leading={leading}
      trailing={trailing}
      selected={selected}
      onSelect={select}
      testID={`explorer-execution-script-${script.scriptName}`}
    >
      {script.scriptName}
    </DropdownMenuItem>
  );
}

export function ExecutionEmpty({
  view,
  hasScripts,
  onCreateTerminal,
  onConfigureScripts,
  creatingTerminal,
  connected,
}: {
  view: ExplorerExecutionState["view"];
  hasScripts: boolean;
  onCreateTerminal: () => void;
  onConfigureScripts?: () => void;
  creatingTerminal: boolean;
  connected: boolean;
}) {
  const { t } = useTranslation();
  let label = t("workspace.tabs.explorerSidebar.execution.idle");
  if (!hasScripts) label = t("workspace.tabs.explorerSidebar.execution.noScripts");
  if (view === "terminal") label = t("workspace.tabs.explorerSidebar.execution.noTerminal");
  const disabled = !connected || creatingTerminal;
  const configureScripts = !hasScripts && view !== "terminal" ? onConfigureScripts : undefined;
  return (
    <View style={styles.empty} testID="explorer-execution-empty">
      {configureScripts ? (
        <PressHighlight
          accessibilityRole="link"
          onPress={configureScripts}
          testID="explorer-execution-configure-scripts"
          style={styles.emptyLink}
        >
          <Text style={styles.emptyLinkText}>{label}</Text>
        </PressHighlight>
      ) : (
        <Text style={styles.emptyText}>{label}</Text>
      )}
      {view === "terminal" ? (
        <Button
          variant="ghost"
          disabled={disabled}
          loading={creatingTerminal}
          onPress={onCreateTerminal}
          testID="explorer-execution-create-terminal"
        >
          {t("workspace.tabs.actions.newTerminal")}
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  header: {
    height: WORKSPACE_SECONDARY_HEADER_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: theme.spacing[3],
    paddingRight: theme.spacing[2],
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.border,
  },
  tabs: { flex: 1, minWidth: 0, alignSelf: "stretch" },
  tabTrack: { flexDirection: "row", alignItems: "center", height: "100%" },
  // Web drops this scroller's content style (docs/unistyles.md), so a view we own centres the row.
  tabRow: { flexDirection: "row", alignItems: "center" },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingLeft: theme.spacing[1],
    flexShrink: 0,
  },
  tab: {
    minHeight: theme.spacing[6],
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    gap: theme.spacing[1],
    marginRight: theme.spacing[0.5],
    padding: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
  },
  tabHover: { backgroundColor: theme.colors.surfaceSidebarHover },
  tabSelected: { backgroundColor: theme.colors.surfaceSidebarSelected },
  tabText: { fontSize: theme.fontSize.sm, color: theme.colors.foregroundMuted },
  tabTextActive: { color: theme.colors.foreground },
  actionButton: {
    height: HEADER_CONTROL_HEIGHT,
    minHeight: HEADER_CONTROL_HEIGHT,
    paddingHorizontal: theme.spacing[1.5],
    paddingVertical: 0,
    borderRadius: theme.borderRadius.md,
    gap: theme.spacing[1],
  },
  actionText: { fontWeight: theme.fontWeight.normal },
  // Run and its script menu share one border, like the git actions split button.
  runControl: {
    flexShrink: 0,
    height: HEADER_CONTROL_HEIGHT,
    flexDirection: "row",
    alignItems: "stretch",
    borderRadius: theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.borderAccent,
    overflow: "hidden",
  },
  runButton: {
    height: "100%",
    minHeight: 0,
    paddingHorizontal: theme.spacing[1.5],
    paddingVertical: 0,
    borderWidth: 0,
    borderRadius: 0,
    gap: theme.spacing[1],
  },
  runCaret: {
    height: "100%",
    borderRadius: 0,
    borderLeftWidth: theme.borderWidth[1],
    borderLeftColor: theme.colors.borderAccent,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[2],
    padding: theme.spacing[4],
  },
  emptyText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
  },
  emptyLink: isWeb ? { cursor: "pointer" as const } : {},
  emptyLinkText: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
    textDecorationLine: "underline",
  },
}));
