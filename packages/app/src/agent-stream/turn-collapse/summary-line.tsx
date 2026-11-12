import { memo, useCallback, useMemo } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { FileDiff, FileText, Search, SquareTerminal, Summary, Wrench } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useDisclosureHold } from "@/agent-stream/disclosure";
import { ExpandableBadge } from "@/components/message";
import { ICON_SIZE, ICON_STROKE_WIDTH, type Theme } from "@/styles/theme";
import type { TurnSummaryItem } from "@/types/stream";

const ThemedSquareTerminal = withUnistyles(SquareTerminal);
const ThemedSearch = withUnistyles(Search);
const ThemedFileText = withUnistyles(FileText);
const ThemedFileDiff = withUnistyles(FileDiff);
const ThemedWrench = withUnistyles(Wrench);
const mutedIconMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

/**
 * The row a collapsed turn leaves under its user message, styled like a tool-call group.
 * Pressing it opens the turn's rows beneath it.
 */
export const TurnSummaryLine = memo(function TurnSummaryLine({
  item,
  onExpandedChange,
}: {
  item: TurnSummaryItem;
  onExpandedChange: (hostId: string, expanded: boolean) => void;
}) {
  const { t } = useTranslation();
  const toolCallCount = item.tools.toolCallCount;
  const toolLabel =
    toolCallCount > 0
      ? t(`turnSummary.toolCalls.${toolCallCount === 1 ? "one" : "other"}`, {
          count: toolCallCount,
        })
      : null;
  const messageLabel =
    item.messageCount > 0
      ? t(`turnSummary.messages.${item.messageCount === 1 ? "one" : "other"}`, {
          count: item.messageCount,
        })
      : null;
  const label = [toolLabel, messageLabel].filter(Boolean).join(", ") || t("turnSummary.details");
  const activityIcons = useTurnActivityIcons(item);
  const hold = useDisclosureHold();
  const toggle = useCallback(
    () => hold(() => onExpandedChange(item.hostId, !item.expanded)),
    [hold, onExpandedChange, item.expanded, item.hostId],
  );

  return (
    <ExpandableBadge
      testID="turn-summary"
      label={label}
      labelAccessory={activityIcons}
      icon={Summary}
      isExpanded={item.expanded}
      onToggle={toggle}
      borderlessWhenExpanded
    />
  );
});

function useTurnActivityIcons(item: TurnSummaryItem) {
  return useMemo(() => {
    const { tools } = item;
    const paseoCallCount = Object.values(tools.paseoActions).reduce((sum, count) => sum + count, 0);
    const activities = [
      [tools.commandCount, "terminal", ThemedSquareTerminal],
      [tools.searchCount, "search", ThemedSearch],
      [tools.readFileCount, "read", ThemedFileText],
      [tools.editedFileCount, "edit", ThemedFileDiff],
      [tools.otherToolCount + paseoCallCount, "other", ThemedWrench],
    ] as const;
    const shown = activities.filter(([count]) => count > 0);
    if (shown.length === 0) return undefined;
    return (
      <View style={styles.activities} pointerEvents="none" testID="turn-summary-activities">
        {shown.map(([, activity, Icon]) => (
          <View key={activity} testID={`turn-summary-activity-${activity}`}>
            <Icon size={ICON_SIZE.sm} strokeWidth={ICON_STROKE_WIDTH} uniProps={mutedIconMapping} />
          </View>
        ))}
      </View>
    );
  }, [item]);
}

const styles = StyleSheet.create((theme) => ({
  activities: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    gap: theme.spacing[2],
    marginLeft: theme.spacing[3],
  },
}));
