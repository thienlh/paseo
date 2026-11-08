import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { ParsedDiffFile } from "@getpaseo/protocol/messages";
import { buildNumberedDiffHunks } from "@/utils/diff-layout";
import {
  addReviewDraftComment,
  buildReviewDraftKey,
  getReviewDraftComments,
  isReviewCommentOnDiff,
} from "@/review/store";
import { selectWorkingDiffComparison } from "@/git/working-diff-comparison";
import { normalizeFindingPath, type ReviewFinding } from "./findings";

type FindingsClient = Pick<DaemonClient, "getCheckoutDiff">;

export interface AddedReviewFindings {
  /** On the diff now, including any that already were. */
  added: number;
  /** Of `added`, how many were not on a diff line and went on the nearest one instead. */
  moved: number;
  /** The diff is empty, so there was no line to put them on. */
  offDiff: number;
}

interface CommentAnchor {
  filePath: string;
  side: "old" | "new";
  lineNumber: number;
  body: string;
}

/**
 * Adds findings as inline comments on the Changes diff, where the Changes pane's feedback action
 * sends them to any chat. Reviews read the branch plus the working tree, so this uses the "all"
 * comparison and switches the Changes pane to it; without a base branch only uncommitted changes
 * exist to comment on. `baseRef` and `ignoreWhitespace` must be the Changes pane's own, because
 * comments only show under the draft key built from them.
 */
export async function addReviewFindingsToChanges(input: {
  client: FindingsClient;
  serverId: string;
  workspaceId: string;
  cwd: string;
  baseRef: string | undefined;
  ignoreWhitespace: boolean;
  findings: readonly ReviewFinding[];
}): Promise<AddedReviewFindings> {
  const mode = input.baseRef ? "all" : "uncommitted";
  const diff = await input.client.getCheckoutDiff(input.cwd, {
    mode,
    ...(input.baseRef ? { baseRef: input.baseRef } : {}),
    ignoreWhitespace: input.ignoreWhitespace,
  });
  if (diff.error) {
    throw new Error(diff.error.message);
  }
  const key = buildReviewDraftKey({
    serverId: input.serverId,
    workspaceId: input.workspaceId,
    cwd: input.cwd,
    mode,
    baseRef: input.baseRef,
    ignoreWhitespace: input.ignoreWhitespace,
  });

  const result: AddedReviewFindings = { added: 0, moved: 0, offDiff: 0 };
  for (const finding of input.findings) {
    const anchored = anchorFinding(finding, input.cwd, diff.files);
    if (!anchored) {
      result.offDiff += 1;
      continue;
    }
    const { comment, moved } = anchored;
    const existing = getReviewDraftComments(key) ?? [];
    const isDuplicate = existing.some(
      (candidate) =>
        candidate.filePath === comment.filePath &&
        candidate.side === comment.side &&
        candidate.lineNumber === comment.lineNumber &&
        candidate.body === comment.body,
    );
    // Adding a finding that is already there leaves the one comment in place.
    if (!isDuplicate) addReviewDraftComment({ key, comment });
    result.added += 1;
    if (moved) result.moved += 1;
  }

  if (result.added > 0) {
    selectWorkingDiffComparison({
      serverId: input.serverId,
      workspaceId: input.workspaceId,
      cwd: input.cwd,
      comparison: mode,
    });
  }
  return result;
}

/**
 * Places a finding on a line of the diff, since only a diff line can carry a comment to an agent.
 * A finding about an unchanged line, or about the change as a whole, goes on the nearest diff line
 * in its file, or on the first changed line when its file is not in the diff. Its body then names
 * where it really points, so the agent still gets the right location.
 */
function anchorFinding(
  finding: ReviewFinding,
  cwd: string,
  diffFiles: readonly ParsedDiffFile[],
): { comment: CommentAnchor; moved: boolean } | null {
  const filePath = finding.file === null ? null : normalizeFindingPath(finding.file, cwd);
  const text = finding.title ? `${finding.title}\n${finding.body}` : finding.body;
  if (filePath !== null && finding.line !== null) {
    const exact = { filePath, side: finding.side, lineNumber: finding.line, body: text };
    if (isReviewCommentOnDiff({ comment: exact, diffFiles })) {
      return { comment: exact, moved: false };
    }
  }

  // A binary, too-large, or rename-only file is in the diff without lines to comment on.
  const sameFile = diffFiles.find((file) => file.path === filePath && diffLines(file).length > 0);
  const target = sameFile ?? diffFiles.find((file) => diffLines(file).length > 0);
  if (!target) {
    return null;
  }
  const lines = diffLines(target);
  const nearest =
    sameFile && finding.line !== null
      ? nearestLine(lines, finding.line)
      : (lines.find((line) => line.changed && line.side === "new") ??
        lines.find((line) => line.changed) ??
        lines[0]);
  if (!nearest) {
    return null;
  }
  const location = describeLocation({
    filePath,
    line: finding.line,
    inSameFile: Boolean(sameFile),
  });
  return {
    comment: {
      filePath: target.path,
      side: nearest.side,
      lineNumber: nearest.lineNumber,
      body: location ? `About ${location}: ${text}` : text,
    },
    moved: true,
  };
}

/** Where a moved finding really points, or null when its new place already says it. */
function describeLocation(input: {
  filePath: string | null;
  line: number | null;
  inSameFile: boolean;
}): string | null {
  if (input.filePath === null) return null;
  if (input.inSameFile) return input.line === null ? null : `line ${input.line}`;
  return input.line === null ? input.filePath : `${input.filePath}:${input.line}`;
}

interface DiffLineAnchor {
  side: "old" | "new";
  lineNumber: number;
  changed: boolean;
}

function diffLines(file: ParsedDiffFile): DiffLineAnchor[] {
  return buildNumberedDiffHunks(file).flatMap((hunk) =>
    hunk.lines.flatMap((line): DiffLineAnchor[] => {
      if (line.newCell?.lineNumber) {
        return [
          { side: "new", lineNumber: line.newCell.lineNumber, changed: line.line.type === "add" },
        ];
      }
      if (line.oldCell?.lineNumber) {
        return [{ side: "old", lineNumber: line.oldCell.lineNumber, changed: true }];
      }
      return [];
    }),
  );
}

function nearestLine(lines: readonly DiffLineAnchor[], line: number): DiffLineAnchor | undefined {
  const newSide = lines.filter((candidate) => candidate.side === "new");
  const candidates = newSide.length > 0 ? newSide : lines;
  let best: DiffLineAnchor | undefined;
  for (const candidate of candidates) {
    if (!best || Math.abs(candidate.lineNumber - line) < Math.abs(best.lineNumber - line)) {
      best = candidate;
    }
  }
  return best;
}
