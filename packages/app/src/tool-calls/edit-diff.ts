import type { ToolCallDetail } from "@getpaseo/protocol/agent-types";
import { buildLineDiff, parseUnifiedDiff, type DiffLine } from "@/utils/tool-call-parsers";

export interface ToolCallEditDiffStat {
  additions: number;
  deletions: number;
}

export function buildToolCallEditDiffLines(
  detail: ToolCallDetail | undefined,
): DiffLine[] | undefined {
  if (detail?.type !== "edit") return undefined;
  return detail.unifiedDiff
    ? parseUnifiedDiff(detail.unifiedDiff)
    : buildLineDiff(detail.oldString ?? "", detail.newString ?? "");
}

type EditDetail = Extract<ToolCallDetail, { type: "edit" }>;

const MAX_CHANGED_LINES = 512;
const countsByDetail = new WeakMap<EditDetail, { value: ToolCallEditDiffStat | undefined }>();

export function buildToolCallEditDiffStat(
  detail: ToolCallDetail | undefined,
): ToolCallEditDiffStat | undefined {
  if (
    detail?.type !== "edit" ||
    (!detail.unifiedDiff && detail.oldString === undefined && detail.newString === undefined)
  ) {
    return undefined;
  }
  const cached = countsByDetail.get(detail);
  if (cached) return cached.value;
  const value = detail.unifiedDiff
    ? countUnifiedDiff(detail.unifiedDiff)
    : countReplacementLines(detail.oldString ?? "", detail.newString ?? "");
  countsByDetail.set(detail, { value });
  return value;
}

function countUnifiedDiff(diffText: string): ToolCallEditDiffStat {
  let additions = 0;
  let deletions = 0;
  for (const line of diffText.replace(/\r\n/g, "\n").split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) additions += 1;
    if (line.startsWith("-") && !line.startsWith("---")) deletions += 1;
  }
  return { additions, deletions };
}

function countReplacementLines(oldText: string, newText: string): ToolCallEditDiffStat | undefined {
  const oldLines = oldText ? oldText.replace(/\r\n/g, "\n").split("\n") : [];
  const newLines = newText ? newText.replace(/\r\n/g, "\n").split("\n") : [];
  let prefix = 0;
  while (
    prefix < oldLines.length &&
    prefix < newLines.length &&
    oldLines[prefix] === newLines[prefix]
  ) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  const changedOld = oldLines.slice(prefix, oldLines.length - suffix);
  const changedNew = newLines.slice(prefix, newLines.length - suffix);
  if (changedOld.length + changedNew.length > MAX_CHANGED_LINES) return undefined;

  // Only LCS length is needed for badge counts. Two rows avoid the visual diff's
  // full matrix and word-level segments; the cap bounds work for pathological edits.
  let previous = new Uint32Array(changedNew.length + 1);
  for (let oldIndex = 1; oldIndex <= changedOld.length; oldIndex += 1) {
    const current = new Uint32Array(changedNew.length + 1);
    for (let newIndex = 1; newIndex <= changedNew.length; newIndex += 1) {
      current[newIndex] =
        changedOld[oldIndex - 1] === changedNew[newIndex - 1]
          ? previous[newIndex - 1] + 1
          : Math.max(previous[newIndex], current[newIndex - 1]);
    }
    previous = current;
  }
  const common = previous[changedNew.length];
  return {
    additions: changedNew.length - common,
    deletions: changedOld.length - common,
  };
}
