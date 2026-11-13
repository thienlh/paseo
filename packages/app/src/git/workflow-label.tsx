import { View } from "react-native";
import Animated, { FadeIn, ReduceMotion } from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { StatusBadge, type StatusBadgeVariant } from "@/components/ui/status-badge";
import type { GitWorkflowState } from "./workflow";

const variants: Record<GitWorkflowState, StatusBadgeVariant> = {
  local: "muted",
  open: "muted",
  waiting: "warning",
  attention: "warning",
  ready: "success",
  merged: "merged",
  closed: "muted",
};
// Custom entering keyframes (withInitialValues) freeze the web node at an absolute
// position during delayed cleanup. Keep the built-in fade and normal flex layout.
const entrance = FadeIn.duration(100).reduceMotion(ReduceMotion.System);

export function GitWorkflowLabel({ state }: { state: GitWorkflowState }) {
  const { t } = useTranslation();
  return (
    <View style={styles.label} testID="git-workflow-status" accessibilityLiveRegion="polite">
      <Animated.View key={state} entering={entrance}>
        <StatusBadge
          label={t(`workspace.git.actions.workflow.${state}`)}
          variant={variants[state]}
          size="xs"
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { flexShrink: 1, minWidth: 0, display: { xs: "none", md: "flex" } },
});
