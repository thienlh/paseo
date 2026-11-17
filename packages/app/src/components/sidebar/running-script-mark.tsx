import { useMemo } from "react";
import { View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { RunActivity } from "@/screens/workspace/explorer-sidebar/execution/run-activity";
import { scriptToneColorMapping } from "@/screens/workspace/scripts/script-status";

const MARK_SIZE = 12;

const runningColor = scriptToneColorMapping("running");

const ThemedBars = withUnistyles(ActivityBars);

/** A compact running-script status that leaves the workspace title and meta row untouched. */
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
    <View style={styles.mark} testID="sidebar-running-script" accessible accessibilityLabel={label}>
      <ThemedBars uniProps={runningColor} />
    </View>
  );
}

function ActivityBars({ color }: { color?: string }) {
  return <RunActivity running connected color={color ?? "transparent"} size={MARK_SIZE} />;
}

const styles = StyleSheet.create({
  mark: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: MARK_SIZE,
    height: 20,
    flexShrink: 0,
  },
});
