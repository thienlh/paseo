import { useMemo, type ReactNode } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { ToolCallDetail } from "@getpaseo/protocol/agent-types";
import { DiffStat } from "@/components/diff-stat";
import { DiffViewer } from "@/components/diff-viewer";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { highlightDiffLines } from "@/utils/diff-highlight";
import { turnFileDiffLines } from "@/agent-stream/turn-file-changes";
import { buildToolCallEditDiffStat } from "./edit-diff";

const PREVIEW_MAX_HEIGHT = 320;

export function ToolCallEditHoverCard({
  detail,
  summary,
  children,
}: {
  detail: ToolCallDetail | undefined;
  summary?: string;
  children: ReactNode;
}) {
  if (detail?.type !== "edit" && detail?.type !== "write") return children;
  const path = summary ?? detail.filePath;
  return (
    <HoverCard>
      <HoverCardTrigger accessibilityLabel={path}>{children}</HoverCardTrigger>
      <HoverCardContent placement="top" offset={8} style={styles.preview} accessibilityLabel={path}>
        <EditPreview detail={detail} path={path} />
      </HoverCardContent>
    </HoverCard>
  );
}

/** Mounted only while the card is open, so the full visual diff is built on demand. */
export function EditPreview({
  detail,
  path,
}: {
  detail: Extract<ToolCallDetail, { type: "edit" | "write" }>;
  path: string;
}) {
  const diffLines = useMemo(() => {
    const change = { filePath: detail.filePath, additions: 0, deletions: 0, edits: [detail] };
    return highlightDiffLines(turnFileDiffLines(change), detail.filePath);
  }, [detail]);
  const diffStat =
    detail.type === "edit"
      ? buildToolCallEditDiffStat(detail)
      : {
          additions: diffLines.filter((line) => line.type === "add").length,
          deletions: 0,
        };
  return (
    <>
      <View style={styles.previewHeader}>
        <Text style={styles.previewPath} numberOfLines={1} ellipsizeMode="middle">
          {path}
        </Text>
        {diffStat ? (
          <DiffStat additions={diffStat.additions} deletions={diffStat.deletions} />
        ) : null}
      </View>
      <DiffViewer diffLines={diffLines} maxHeight={PREVIEW_MAX_HEIGHT} />
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  preview: {
    width: 520,
    maxWidth: "90%",
    gap: theme.spacing[2],
    padding: theme.spacing[2],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  previewPath: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foregroundMuted,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.sm,
  },
}));
