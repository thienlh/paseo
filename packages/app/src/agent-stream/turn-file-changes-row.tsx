import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { DiffStat } from "@/components/diff-stat";
import { DiffViewer } from "@/components/diff-viewer";
import { MaterialFileIcon } from "@/components/material-file-icon";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import type { StreamItem } from "@/types/stream";
import { highlightDiffLines } from "@/utils/diff-highlight";
import {
  collectTurnFileChanges,
  displayChangedFilePath,
  turnFileDiffLines,
  type TurnCallsResolver,
  type TurnFileChange,
} from "./turn-file-changes";

// A turn that touched many files renders its chips over a few frames instead of in one commit.
const CHIP_BATCH = 24;
const PREVIEW_MAX_HEIGHT = 320;

/**
 * Supplied by the stream, which knows which calls a grouped row or a folded turn stands for.
 * Without it each row stands for itself.
 */
export const TurnCallsResolverContext = createContext<TurnCallsResolver | undefined>(undefined);

/**
 * Every file a turn changed, under its reply: a chip per file with its line counts, and the
 * turn's own diff for that file on hover.
 */
export function TurnFileChangesRow({
  items,
  workspaceRoot,
}: {
  items: readonly StreamItem[];
  workspaceRoot?: string;
}) {
  const resolveCalls = useContext(TurnCallsResolverContext);
  const changes = useMemo(() => collectTurnFileChanges(items, resolveCalls), [items, resolveCalls]);
  const shown = useProgressiveCount(changes.length);
  if (changes.length === 0) {
    return null;
  }
  return (
    <View style={styles.row} testID="turn-file-changes">
      {changes.slice(0, shown).map((change) => (
        <FileChip key={change.filePath} change={change} workspaceRoot={workspaceRoot} />
      ))}
    </View>
  );
}

/**
 * How many of `total` to render: the first batch at once, then one more batch per tick. A timer
 * rather than an animation frame, because frames pause while the window is hidden.
 */
function useProgressiveCount(total: number): number {
  const [extra, setExtra] = useState(0);
  const shown = Math.min(total, CHIP_BATCH + extra);
  useEffect(() => {
    if (shown >= total) return;
    const timer = setTimeout(() => setExtra((current) => current + CHIP_BATCH), 0);
    return () => clearTimeout(timer);
  }, [shown, total]);
  return shown;
}

function FileChip({ change, workspaceRoot }: { change: TurnFileChange; workspaceRoot?: string }) {
  const path = displayChangedFilePath(change.filePath, workspaceRoot);
  const name = path.split("/").findLast(Boolean) ?? path;
  return (
    <HoverCard>
      <HoverCardTrigger focusable accessibilityLabel={path}>
        <View style={styles.chip} testID="turn-file-change">
          <MaterialFileIcon fileName={name} size={12} />
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <DiffStat additions={change.additions} deletions={change.deletions} />
        </View>
      </HoverCardTrigger>
      <HoverCardContent placement="top" offset={8} style={styles.preview} accessibilityLabel={path}>
        <FileChangePreview change={change} path={path} />
      </HoverCardContent>
    </HoverCard>
  );
}

/** Mounted only while the hover card is open, so the diff is built on demand. */
function FileChangePreview({ change, path }: { change: TurnFileChange; path: string }) {
  const diffLines = useMemo(
    () => highlightDiffLines(turnFileDiffLines(change), change.filePath),
    [change],
  );
  return (
    <>
      <View style={styles.previewHeader}>
        <Text style={styles.previewPath} numberOfLines={1}>
          {path}
        </Text>
        <DiffStat additions={change.additions} deletions={change.deletions} />
      </View>
      <DiffViewer diffLines={diffLines} maxHeight={PREVIEW_MAX_HEIGHT} />
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: theme.spacing[1.5],
    flexShrink: 0,
    minWidth: 0,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    height: 22,
    maxWidth: 220,
    paddingHorizontal: theme.spacing[1.5],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
  },
  name: {
    flexShrink: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
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
