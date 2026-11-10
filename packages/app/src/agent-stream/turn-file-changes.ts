import type { ToolCallDetail } from "@getpaseo/protocol/agent-types";
import type { StreamItem, ThoughtItem, ToolCallItem } from "@/types/stream";
import { buildToolCallEditDiffStat } from "@/tool-calls/edit-diff";
import { buildLineDiff, parseUnifiedDiff, type DiffLine } from "@/utils/tool-call-parsers";

type FileChangeDetail = Extract<ToolCallDetail, { type: "edit" | "write" }>;

/**
 * The rows a rendered row stands for. A grouped tool-call row stands for its calls, and a closed
 * turn's summary row for the calls it folds; every other row stands for itself.
 */
export type TurnCallsResolver = (row: StreamItem) => readonly StreamItem[];

const identityResolver: TurnCallsResolver = (row) => [row];

export interface TurnCallsResolverPresentation {
  groupsByHostId: {
    get(id: string): { run: { calls: readonly (ToolCallItem | ThoughtItem)[] } } | undefined;
  };
  turns: {
    foldedCallsByHostId: ReadonlyMap<string, readonly (ToolCallItem | ThoughtItem)[]>;
  };
}

export function createTurnCallsResolver(
  presentation: TurnCallsResolverPresentation,
): TurnCallsResolver {
  return (row) => {
    if (row.kind === "turn_summary") {
      // An open turn's calls are already in the list beside its summary row.
      return row.expanded ? [] : (presentation.turns.foldedCallsByHostId.get(row.hostId) ?? []);
    }
    if (row.kind === "tool_call" || row.kind === "thought") {
      return presentation.groupsByHostId.get(row.id)?.run.calls ?? [row];
    }
    return [row];
  };
}

/** One file a turn edited or wrote: its line counts, and the edits that make up its diff. */
export interface TurnFileChange {
  filePath: string;
  additions: number;
  deletions: number;
  edits: readonly FileChangeDetail[];
}

interface LineCounts {
  additions: number;
  deletions: number;
}

// Stream items keep their detail objects, so each edit is counted once no matter how often the
// footer renders. Only the counts are kept; a preview rebuilds its visual lines when it opens.
const countsByDetail = new WeakMap<FileChangeDetail, LineCounts>();
const EMPTY_LINE_COUNTS: LineCounts = { additions: 0, deletions: 0 };

/**
 * The files a turn changed through its edit and write tool calls, in the order it first touched
 * them. Changes made through shell commands are not tool-call edits, so they are not counted.
 */
export function collectTurnFileChanges(
  items: readonly StreamItem[],
  resolveCalls: TurnCallsResolver = identityResolver,
): TurnFileChange[] {
  const byPath = new Map<string, TurnFileChange & { edits: FileChangeDetail[] }>();
  for (const item of items.flatMap((row) => resolveCalls(row))) {
    if (item.kind !== "tool_call" || item.payload.source !== "agent") continue;
    const { status, detail } = item.payload.data;
    if (status !== "completed") continue;
    if (detail.type !== "edit" && detail.type !== "write") continue;

    const counts = countLines(detail);
    const change = byPath.get(detail.filePath);
    if (change) {
      change.additions += counts.additions;
      change.deletions += counts.deletions;
      change.edits.push(detail);
    } else {
      byPath.set(detail.filePath, {
        filePath: detail.filePath,
        additions: counts.additions,
        deletions: counts.deletions,
        edits: [detail],
      });
    }
  }
  return [...byPath.values()].filter((change) => change.additions + change.deletions > 0);
}

/** The turn's diff for one file, built when a preview asks for it. */
export function turnFileDiffLines(change: TurnFileChange): DiffLine[] {
  return change.edits.flatMap((edit) => diffLines(edit));
}

function countLines(detail: FileChangeDetail): LineCounts {
  const cached = countsByDetail.get(detail);
  if (cached) return cached;
  let counts = EMPTY_LINE_COUNTS;
  if (detail.type === "edit") {
    counts = buildToolCallEditDiffStat(detail) ?? EMPTY_LINE_COUNTS;
  } else {
    const lines = diffLines(detail);
    counts = {
      additions: lines.filter((line) => line.type === "add").length,
      deletions: lines.filter((line) => line.type === "remove").length,
    };
  }
  countsByDetail.set(detail, counts);
  return counts;
}

function diffLines(detail: FileChangeDetail): DiffLine[] {
  if (detail.type === "write") {
    if (!detail.content) return [];
    return detail.content
      .replace(/\n$/, "")
      .split("\n")
      .map((line) => ({ type: "add", content: line }));
  }
  if (detail.unifiedDiff) return parseUnifiedDiff(detail.unifiedDiff);
  return buildLineDiff(detail.oldString ?? "", detail.newString ?? "");
}

/** `src/app.ts` for a path inside the workspace; the path as given otherwise. */
export function displayChangedFilePath(filePath: string, workspaceRoot: string | undefined) {
  const root = workspaceRoot?.replace(/\/+$/, "");
  return root && filePath.startsWith(`${root}/`) ? filePath.slice(root.length + 1) : filePath;
}
