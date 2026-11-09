import { View, Text } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { formatDiffCount } from "@/git/file-header-presentation";

interface DiffStatProps {
  additions: number;
  deletions: number;
  muted?: boolean;
  testID?: string;
}

export function DiffStat({ additions, deletions, muted = false, testID }: DiffStatProps) {
  return (
    <View style={styles.row} testID={testID}>
      <Text style={[styles.additions, muted && styles.muted]}>+{formatDiffCount(additions)}</Text>
      <Text style={[styles.deletions, muted && styles.muted]}>-{formatDiffCount(deletions)}</Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    height: 20,
    gap: 4,
    flexShrink: 0,
  },
  additions: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
    color: theme.colors.statusSuccess,
  },
  deletions: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
    color: theme.colors.statusDanger,
  },
  muted: {
    color: theme.colors.foregroundMuted,
  },
}));
