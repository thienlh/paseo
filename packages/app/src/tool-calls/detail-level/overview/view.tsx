import React, { memo, useCallback, type ReactNode } from "react";
import { View } from "react-native";
import { Wrench } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import { useDisclosureHold } from "@/agent-stream/disclosure";
import { IndentRail } from "@/components/indent-rail";
import { ExpandableBadge } from "@/components/message";
import { useIsCompactFormFactor } from "@/constants/layout";
import { useOverviewSummaryLabel } from "./label";
import type { OverviewToolCallGroup } from "./model";
import { OverviewToolCallGroupSheet } from "./sheet";

interface OverviewGroupProps {
  group: OverviewToolCallGroup;
  expanded: boolean;
  isLastInSequence: boolean;
  onExpandedChange: (groupId: string, expanded: boolean) => void;
  children: ReactNode;
}

export const OverviewToolCallGroupView = memo(function OverviewToolCallGroupView({
  group,
  expanded,
  isLastInSequence,
  onExpandedChange,
  children,
}: OverviewGroupProps) {
  const isCompact = useIsCompactFormFactor();
  const aggregateSummary = useOverviewSummaryLabel(group.summary);
  const hold = useDisclosureHold();
  const toggle = useCallback(() => {
    const apply = () => onExpandedChange(group.run.id, !expanded);
    // Compact opens a sheet; nothing in the timeline moves.
    if (isCompact) apply();
    else hold(apply);
  }, [expanded, group.run.id, hold, isCompact, onExpandedChange]);
  const close = useCallback(() => {
    onExpandedChange(group.run.id, false);
  }, [group.run.id, onExpandedChange]);
  const renderDetails = useCallback(
    () => (
      <View style={styles.content}>
        <IndentRail>{children}</IndentRail>
      </View>
    ),
    [children],
  );

  if (isCompact) {
    return (
      <>
        <ExpandableBadge
          testID="tool-call-group"
          label={aggregateSummary}
          icon={Wrench}
          isLoading={group.isLoading}
          isExpanded={false}
          isLastInSequence={isLastInSequence}
          onToggle={toggle}
        />
        <OverviewToolCallGroupSheet visible={expanded} summary={aggregateSummary} onClose={close}>
          {children}
        </OverviewToolCallGroupSheet>
      </>
    );
  }

  return (
    <ExpandableBadge
      testID="tool-call-group"
      label={aggregateSummary}
      icon={Wrench}
      isLoading={group.isLoading}
      isExpanded={expanded}
      isLastInSequence={isLastInSequence}
      onToggle={toggle}
      renderDetails={renderDetails}
      borderlessWhenExpanded
    />
  );
});

const styles = StyleSheet.create((theme) => ({
  content: {
    paddingTop: theme.spacing[1],
    paddingHorizontal: 13,
  },
}));
