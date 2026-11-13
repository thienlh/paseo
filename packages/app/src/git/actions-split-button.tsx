import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useCallback, useMemo } from "react";
import { View, Text, Pressable, type PressableStateCallbackType } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Archive, ChevronDown, GitBranch, MoreVertical } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Shortcut } from "@/components/ui/shortcut";
import { useShortcutKeys } from "@/hooks/use-shortcut-keys";
import Animated, { FadeIn, ReduceMotion } from "react-native-reanimated";
import { Button } from "@/components/ui/button";
import { GitWorkflowLabel } from "./workflow-label";
import type { ShortcutKey } from "@/utils/format-shortcut";
import { actionsWithoutPrimary, type GitAction, type GitActions } from "@/git/policy";
import { useGitActionRunner } from "@/git/use-actions";
import { HEADER_CONTROL_HEIGHT } from "@/components/ui/control-geometry";

const ThemedChevronDown = withUnistyles(ChevronDown, (theme) => ({
  color: theme.colors.foregroundExtraMuted,
}));
const ThemedGitBranch = withUnistyles(GitBranch, (theme) => ({
  color: theme.colors.foregroundMuted,
}));
const ThemedMoreVertical = withUnistyles(MoreVertical, (theme) => ({
  color: theme.colors.foregroundMuted,
}));
const ThemedSpinner = withUnistyles(LoadingSpinner, (theme) => ({
  color: theme.colors.foreground,
}));
const ArchiveIcon = withUnistyles(Archive, (theme) => ({ color: theme.colors.surface0 }));
const actionEntrance = FadeIn.duration(100).reduceMotion(ReduceMotion.System);

interface GitActionsSplitButtonProps {
  gitActions: GitActions;
  hideLabels?: boolean;
  menuOnly?: boolean;
}

interface GitActionMenuItemProps {
  action: GitAction;
  onSelect: (action: GitAction) => void;
  archiveShortcutKeys?: ShortcutKey[][] | null;
  needsSeparator?: boolean;
  showSeparator?: boolean;
  closeOnSelect?: boolean;
}

function GitActionMenuItem({
  action,
  onSelect,
  archiveShortcutKeys,
  needsSeparator,
  showSeparator,
  closeOnSelect,
}: GitActionMenuItemProps) {
  const handleSelect = useCallback(() => onSelect(action), [onSelect, action]);
  const trailing = useMemo(
    () =>
      action.id === "archive-workspace" && archiveShortcutKeys ? (
        <Shortcut chord={archiveShortcutKeys} />
      ) : undefined,
    [action.id, archiveShortcutKeys],
  );
  return (
    <View>
      {needsSeparator && showSeparator ? <DropdownMenuSeparator /> : null}
      <DropdownMenuItem
        testID={
          action.id === "archive-workspace"
            ? "workspace-archive-action"
            : `changes-menu-${action.id}`
        }
        leading={action.icon}
        trailing={trailing}
        disabled={action.disabled}
        muted={Boolean(action.unavailableMessage)}
        status={action.status}
        pendingLabel={action.pendingLabel}
        successLabel={action.successLabel}
        closeOnSelect={closeOnSelect}
        onSelect={handleSelect}
      >
        {action.label}
      </DropdownMenuItem>
    </View>
  );
}

function ActionIcon({ action }: { action: GitAction }) {
  if (action.status === "pending")
    return <ThemedSpinner size="small" style={styles.splitButtonSpinnerOnly} />;
  if (action.id === "archive-workspace") return <ArchiveIcon size={16} />;
  return action.icon;
}

function WorkflowLabel({ state, hidden }: { state: GitActions["workflow"]; hidden?: boolean }) {
  if (hidden || !state || state === "local" || state === "open" || state === "ready") return null;
  return <GitWorkflowLabel state={state} />;
}

export function GitActionsSplitButton({
  gitActions,
  hideLabels,
  menuOnly = false,
}: GitActionsSplitButtonProps) {
  const { t } = useTranslation();
  const runGitAction = useGitActionRunner();
  const archiveShortcutKeys = useShortcutKeys("archive-workspace");

  const getActionDisplayLabel = useCallback((action: GitAction): string => {
    if (action.status === "pending")
      return action.id === "archive-workspace" ? action.pendingLabel : action.label;
    if (action.status === "success") return action.successLabel;
    return action.label;
  }, []);

  const handlePrimaryPress = useCallback(() => {
    if (!gitActions.primary) {
      return;
    }
    runGitAction(gitActions.primary);
  }, [gitActions.primary, runGitAction]);

  const overflowMenuButtonStyle = useMemo(() => [styles.iconButton, styles.overflowMenuButton], []);

  const continueAction = gitActions.continueAction;
  const handleContinue = useCallback(() => {
    if (continueAction) runGitAction(continueAction);
  }, [continueAction, runGitAction]);
  const primaryDisabled = gitActions.primary?.disabled;
  const primaryPressableStyle = useCallback(
    ({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.splitButtonPrimary,
      (Boolean(hovered) || pressed) && styles.interaction,
      primaryDisabled && styles.splitButtonPrimaryDisabled,
    ],
    [primaryDisabled],
  );

  const caretTriggerStyle = useCallback(
    ({ hovered, pressed, open }: { hovered: boolean; pressed: boolean; open: boolean }) => [
      styles.splitButtonCaret,
      (hovered || pressed || open) && styles.interaction,
    ],
    [],
  );

  const menuOnlyTriggerStyle = useCallback(
    ({ hovered, pressed, open }: { hovered: boolean; pressed: boolean; open: boolean }) => [
      styles.menuOnlyTrigger,
      (hovered || pressed || open) && styles.interaction,
    ],
    [],
  );

  const menuOnlyActions = [
    ...(gitActions.primary ? [gitActions.primary] : []),
    ...actionsWithoutPrimary(gitActions),
  ];

  if (menuOnly) {
    if (menuOnlyActions.length === 0) {
      return null;
    }

    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          testID="changes-actions-menu-trigger"
          style={menuOnlyTriggerStyle}
          accessibilityRole="button"
          accessibilityLabel={t("workspace.header.actions.workspaceActions")}
        >
          <ThemedGitBranch size={16} />
          <ThemedChevronDown size={12} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" testID="changes-primary-cta-menu">
          {menuOnlyActions.map((action, index) => (
            <GitActionMenuItem
              key={action.id}
              action={action}
              onSelect={runGitAction}
              archiveShortcutKeys={archiveShortcutKeys}
              needsSeparator={action.startsGroup}
              showSeparator={index > 0}
              closeOnSelect={
                action.status === "idle" &&
                action.id === "pr" &&
                action.label === action.pendingLabel &&
                action.label === action.successLabel
              }
            />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  if (!gitActions.primary && gitActions.secondary.length === 0 && gitActions.menu.length === 0) {
    return null;
  }

  return (
    <View style={styles.row}>
      <WorkflowLabel state={gitActions.workflow} hidden={hideLabels} />
      {gitActions.primary ? (
        <View
          style={[
            styles.splitButton,
            gitActions.workflow === "attention" && styles.attention,
            gitActions.workflow === "waiting" && styles.waiting,
            gitActions.primary.id === "archive-workspace" && styles.merged,
          ]}
        >
          <Pressable
            testID="changes-primary-cta"
            style={primaryPressableStyle}
            onPress={handlePrimaryPress}
            disabled={gitActions.primary.disabled}
            accessibilityRole="button"
            accessibilityLabel={gitActions.primary.label}
          >
            <Animated.View key={gitActions.primary.id} entering={actionEntrance}>
              <View style={styles.splitButtonContent}>
                <ActionIcon action={gitActions.primary} />
                {!hideLabels && (
                  <Text
                    style={[
                      styles.splitButtonText,
                      gitActions.primary.id === "archive-workspace" && styles.mergedText,
                    ]}
                  >
                    {getActionDisplayLabel(gitActions.primary)}
                  </Text>
                )}
              </View>
            </Animated.View>
          </Pressable>
          {gitActions.secondary.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                testID="changes-primary-cta-caret"
                style={caretTriggerStyle}
                accessibilityRole="button"
                accessibilityLabel={t("workspace.git.actions.moreOptions")}
              >
                <ThemedChevronDown size={16} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" testID="changes-primary-cta-menu">
                {gitActions.secondary.map((action, index) => (
                  <GitActionMenuItem
                    key={action.id}
                    action={action}
                    onSelect={runGitAction}
                    archiveShortcutKeys={archiveShortcutKeys}
                    needsSeparator={action.startsGroup}
                    showSeparator={index > 0}
                    closeOnSelect={
                      action.status === "idle" &&
                      action.id === "pr" &&
                      action.label === action.pendingLabel &&
                      action.label === action.successLabel
                    }
                  />
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </View>
      ) : null}
      {gitActions.continueAction ? (
        <Button
          variant="outline"
          size="sm"
          style={styles.continueButton}
          textStyle={styles.continueText}
          disabled={gitActions.continueAction.disabled}
          onPress={handleContinue}
          testID="changes-continue-cta"
        >
          {gitActions.continueAction.label}
        </Button>
      ) : null}
      {gitActions.menu.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            testID="changes-overflow-menu"
            hitSlop={8}
            style={overflowMenuButtonStyle}
            accessibilityRole="button"
            accessibilityLabel={t("workspace.git.actions.moreActions")}
          >
            <ThemedMoreVertical size={16} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" width={220} testID="changes-overflow-content">
            {gitActions.menu.map((action) => (
              <GitActionMenuItem
                key={action.id}
                action={action}
                onSelect={runGitAction}
                closeOnSelect={false}
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  interaction: { backgroundColor: theme.colors.interactionHighlight },
  attention: {
    backgroundColor: theme.colors.statusWarningTint,
    borderColor: theme.colors.statusWarning,
  },
  waiting: { backgroundColor: theme.colors.statusWarningTint },
  merged: { backgroundColor: theme.colors.statusMerged, borderColor: theme.colors.statusMerged },
  mergedText: { color: theme.colors.surface0 },
  continueButton: {
    borderStyle: "dashed",
    borderColor: theme.colors.statusMerged,
    height: HEADER_CONTROL_HEIGHT,
  },
  continueText: { color: theme.colors.statusMerged },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    flexShrink: 1,
    minWidth: 0,
  },
  splitButton: {
    flexShrink: 0,
    height: HEADER_CONTROL_HEIGHT,
    flexDirection: "row",
    alignItems: "stretch",
    borderRadius: theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.borderAccent,
    overflow: "hidden",
  },
  splitButtonPrimary: {
    paddingHorizontal: {
      xs: theme.spacing[3],
      md: theme.spacing[2],
    },
    justifyContent: "center",
    position: "relative",
  },
  menuOnlyTrigger: {
    width: {
      xs: 48,
      md: 42,
    },
    height: HEADER_CONTROL_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.borderAccent,
  },
  splitButtonPrimaryDisabled: {
    opacity: 0.6,
  },
  splitButtonText: {
    fontSize: theme.fontSize.base,
    lineHeight: theme.fontSize.base * 1.5,
    color: theme.colors.foreground,
    fontWeight: theme.fontWeight.normal,
  },
  splitButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: {
      xs: theme.spacing[2],
      md: theme.spacing[1],
    },
  },
  splitButtonSpinnerOnly: {
    transform: [{ scale: 0.8 }],
  },
  splitButtonCaret: {
    width: HEADER_CONTROL_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    borderLeftWidth: theme.borderWidth[1],
    borderLeftColor: theme.colors.borderAccent,
  },
  iconButton: {
    width: HEADER_CONTROL_HEIGHT,
    height: HEADER_CONTROL_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
  },
  overflowMenuButton: {
    marginRight: -theme.spacing[2],
  },
}));
