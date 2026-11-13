import { useMemo } from "react";
import { Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { RunActivity } from "@/screens/workspace/explorer-sidebar/execution/run-activity";
import { scriptToneColorMapping } from "@/screens/workspace/scripts/script-status";

const MARK_SIZE = 12;

const runningColor = scriptToneColorMapping("running");

const ThemedBars = withUnistyles(ActivityBars);

/**
 * The running script, sitting on the title line: the same activity bars the execution control
 * uses, then the script's name. Several at once collapse to a count so the title keeps the row.
 */
export function RunningScriptMark({ names }: { names: readonly string[] }) {
  const { t } = useTranslation();
  const [only] = names;
  const label = useMemo(() => {
    if (!only) return "";
    if (names.length === 1) return only;
    return t("workspace.scripts.states.runningCount", { count: names.length });
  }, [names.length, only, t]);

  if (!only) return null;

  return (
    <View style={styles.mark} testID="sidebar-running-script">
      <ThemedBars uniProps={runningColor} />
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function ActivityBars({ color }: { color?: string }) {
  return <RunActivity running connected color={color ?? "transparent"} size={MARK_SIZE} />;
}

const styles = StyleSheet.create((theme) => ({
  mark: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    flexShrink: 1,
    maxWidth: "46%",
    height: 20,
  },
  label: {
    color: runningColor(theme).color,
    fontSize: theme.fontSize.sm,
    lineHeight: 16,
    flexShrink: 1,
  },
}));
