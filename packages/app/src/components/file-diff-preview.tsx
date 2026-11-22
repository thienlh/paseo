import { ScrollView, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { DiffStat } from "@/components/diff-stat";
import { DiffViewer } from "@/components/diff-viewer";
import type { DiffLine } from "@/utils/tool-call-parsers";

const PREVIEW_MAX_HEIGHT = 320;

export function FileDiffPreview({
  path,
  diffLines,
  additions,
  deletions,
  maxHeight = PREVIEW_MAX_HEIGHT,
}: {
  path: string;
  diffLines: DiffLine[];
  additions?: number;
  deletions?: number;
  maxHeight?: number;
}) {
  return (
    <>
      <View style={styles.header} testID="file-diff-preview-header">
        <Text style={styles.path} numberOfLines={1} ellipsizeMode="middle">
          {path}
        </Text>
        {additions !== undefined && deletions !== undefined ? (
          <DiffStat additions={additions} deletions={deletions} />
        ) : null}
      </View>
      <ScrollView style={[styles.body, { maxHeight }]} testID="file-diff-preview-body">
        <DiffViewer diffLines={diffLines} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    width: 520,
    maxWidth: "90%",
    gap: theme.spacing[0],
    padding: theme.spacing[0],
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.borderAccent,
    backgroundColor: theme.colors.surface1,
  },
  path: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foregroundMuted,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.sm,
  },
  body: {
    backgroundColor: theme.colors.surface0,
  },
}));

export const fileDiffPreviewCardStyle = styles.card;
