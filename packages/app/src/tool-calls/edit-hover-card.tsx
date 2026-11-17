import { useMemo, type ReactNode } from "react";
import type { ToolCallDetail } from "@getpaseo/protocol/agent-types";
import { FileDiffPreview, fileDiffPreviewCardStyle } from "@/components/file-diff-preview";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { highlightDiffLines } from "@/utils/diff-highlight";
import { turnFileDiffLines } from "@/agent-stream/turn-file-changes";
import { buildToolCallEditDiffStat } from "./edit-diff";

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
      <HoverCardContent
        placement="top"
        offset={8}
        style={fileDiffPreviewCardStyle}
        accessibilityLabel={path}
      >
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
    <FileDiffPreview
      path={path}
      diffLines={diffLines}
      additions={diffStat?.additions}
      deletions={diffStat?.deletions}
    />
  );
}
