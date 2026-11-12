import { useCallback, useMemo } from "react";
import { Text, View } from "react-native";
import { ChevronDown, ChevronUp, Play, Plus, Square, Eye } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ToolbarButton, ToolbarControls } from "@/components/ui/pane-content-toolbar";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  toolbarLabelTriggerStyle,
  toolbarLabelTriggerTextStyle,
  isToolbarLabelTriggerHighlighted,
} from "@/components/ui/toolbar-label-trigger";
import { extraMutedIconColorMapping } from "@/components/ui/icon-color";
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
}

const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedChevronUp = withUnistyles(ChevronUp);
const ThemedPlus = withUnistyles(Plus);
const ThemedEye = withUnistyles(Eye);

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
  const runIcon = useCallback(
    ({ color, size }: { color: string; size: number }) => (
      <RunActivity running={running} connected={connected} color={color} size={size} />
    ),
    [connected, running],
  );
  const options = useMemo(
    () => [
      {
        value: "run" as const,
        label: t("workspace.scripts.actions.run"),
        icon: runIcon,
        testID: "explorer-execution-run-view",
      },
      {
        value: "terminal" as const,
        label: t("workspace.tabs.fallback.terminal"),
        testID: "explorer-execution-terminal-view",
      },
    ],
    [t, runIcon],
  );
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
  const selectedView = state.expanded && state.surface === "execution" ? state.view : "";
  const terminalDisabled = !connected || creatingTerminal;
  const accessibilityState = useMemo(() => ({ expanded: state.expanded }), [state.expanded]);
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
      >
        {state.expanded ? (
          <ThemedChevronDown size={16} uniProps={extraMutedIconColorMapping} />
        ) : (
          <ThemedChevronUp size={16} uniProps={extraMutedIconColorMapping} />
        )}
      </ToolbarButton>
      <SegmentedControl
        options={options}
        value={selectedView}
        onValueChange={selectView}
        size="sm"
      />
      <View style={styles.spacer} />
      {state.view === "run" ? (
        <RunButton {...props} />
      ) : (
        <ToolbarButton
          label={t("workspace.tabs.actions.newTerminal")}
          compact={compact}
          onPress={onCreateTerminal}
          disabled={terminalDisabled}
          testID="explorer-execution-new-terminal"
        >
          <ThemedPlus size={16} uniProps={extraMutedIconColorMapping} />
        </ToolbarButton>
      )}
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
      testID="explorer-execution-run"
    >
      {label}
    </Button>
  );
}

export function ExecutionScriptPicker({
  script,
  scripts,
  actions,
  dispatch,
  onViewTerminal,
  onOpenUrl,
  compact,
}: ExecutionControlsProps) {
  const { t } = useTranslation();
  const selectedLink = script ? actions.resolveLinks(script).selected : null;
  const handleService = useCallback(() => {
    if (selectedLink) void openServiceUrl(selectedLink.url, { openInApp: onOpenUrl });
  }, [onOpenUrl, selectedLink]);
  if (!script) return null;
  return (
    <View style={styles.scriptHeader}>
      <DropdownMenu>
        <DropdownMenuTrigger
          style={toolbarLabelTriggerStyle}
          testID="explorer-execution-script-picker"
          accessibilityRole="button"
          accessibilityLabel={t("workspace.tabs.explorerSidebar.execution.chooseScript")}
        >
          {(state) => (
            <>
              <ScriptIcon script={script} size={14} />
              <Text
                style={toolbarLabelTriggerTextStyle(isToolbarLabelTriggerHighlighted(state))}
                numberOfLines={1}
              >
                {script.scriptName}
              </Text>
              <ThemedChevronDown size={12} uniProps={extraMutedIconColorMapping} />
            </>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" width={240}>
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
      <View style={styles.spacer} />
      {script.exitCode === null ? null : <ExitCodeBadge code={script.exitCode} />}
      <ToolbarControls>
        {selectedLink ? (
          <ToolbarButton
            label={t("workspace.scripts.actions.openService")}
            compact={compact}
            onPress={handleService}
            testID="explorer-execution-open-service"
          >
            <ThemedEye size={16} uniProps={extraMutedIconColorMapping} />
          </ToolbarButton>
        ) : null}
      </ToolbarControls>
    </View>
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
  const select = useCallback(() => {
    dispatch({ type: "script", name: script.scriptName });
    const terminalId = script.lifecycle === "running" ? script.terminalId : null;
    if (terminalId !== null) onViewTerminal(terminalId);
  }, [dispatch, onViewTerminal, script]);
  return (
    <DropdownMenuItem
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
  creatingTerminal,
  connected,
}: {
  view: ExplorerExecutionState["view"];
  hasScripts: boolean;
  onCreateTerminal: () => void;
  creatingTerminal: boolean;
  connected: boolean;
}) {
  const { t } = useTranslation();
  let label = t("workspace.tabs.explorerSidebar.execution.idle");
  if (!hasScripts) label = t("workspace.tabs.explorerSidebar.execution.noScripts");
  if (view === "terminal") label = t("workspace.tabs.explorerSidebar.execution.noTerminal");
  const disabled = !connected || creatingTerminal;
  return (
    <View style={styles.empty} testID="explorer-execution-empty">
      <Text style={styles.emptyText}>{label}</Text>
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
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    padding: theme.spacing[1],
    minHeight: theme.spacing[8],
  },
  spacer: { flex: 1, minWidth: 0 },
  scriptHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
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
}));
