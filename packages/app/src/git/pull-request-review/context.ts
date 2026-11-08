import type { ParsedDiffFile } from "@getpaseo/protocol/messages";
import { getForgePresentation, normalizeForge, type Forge } from "@/git/forge";
import { REVIEW_FINDINGS_INSTRUCTIONS } from "./findings";

export const PULL_REQUEST_REVIEW_CONTEXT_MAX_CHARS = 100_000;

export interface PullRequestReviewSubject {
  number: number;
  title: string;
  url: string;
  state: string;
  forgeLabel: string;
  baseRef: string;
  headRef: string;
}

interface PullRequestReviewStatus {
  number?: number;
  url: string;
  title: string;
  state: string;
  isMerged?: boolean;
  baseRefName: string;
  headRefName: string;
}

/** Uncommitted work in a workspace, reviewed whether or not the branch has a pull request. */
export interface LocalChangesReviewSubject {
  branch: string | null;
  /** The workspace's base branch. Null reviews only the uncommitted changes. */
  baseRef: string | null;
}

export type ReviewSubject =
  | { kind: "pull_request"; pullRequest: PullRequestReviewSubject }
  | { kind: "local_changes"; changes: LocalChangesReviewSubject };

/**
 * An open pull request wins: its review covers the branch as reviewers will see it. Without one, a
 * dirty workspace still gets a review of its local changes.
 */
export function selectReviewSubject(input: {
  pullRequest: PullRequestReviewSubject | null;
  isDirty: boolean;
  branch: string | null | undefined;
  baseRef: string | null | undefined;
}): ReviewSubject | null {
  if (input.pullRequest) {
    return { kind: "pull_request", pullRequest: input.pullRequest };
  }
  if (!input.isDirty) {
    return null;
  }
  const branch = input.branch?.trim();
  return {
    kind: "local_changes",
    changes: {
      // Git reports a detached checkout as "HEAD", which is not a branch name.
      branch: branch && branch !== "HEAD" ? branch : null,
      baseRef: input.baseRef?.trim() || null,
    },
  };
}

export const LOCAL_CHANGES_REVIEW_CONTEXT_FILE_NAME = "local-changes-review-context.md";

const REVIEW_INSTRUCTIONS = [
  "Review the code. Cover correctness, regressions, missing tests, and unnecessary complexity. Skip praise and style nits unless they hide a defect. Do not edit the code.",
  "",
  REVIEW_FINDINGS_INSTRUCTIONS,
].join("\n");

export function pullRequestReviewContextFileName(number: number): string {
  return `pr-${number}-review-context.md`;
}

export function selectPullRequestReviewSubject(input: {
  status: PullRequestReviewStatus | null | undefined;
  forge: string | null | undefined;
}): PullRequestReviewSubject | null {
  const status = input.status;
  if (!status?.url || status.isMerged || status.state === "merged") {
    return null;
  }
  const number = readPullRequestNumber(status);
  if (number === null) {
    return null;
  }
  return {
    number,
    title: status.title,
    url: status.url,
    state: status.state,
    forgeLabel: getForgePresentation(normalizeForge(input.forge)).brandLabel,
    baseRef: status.baseRefName,
    headRef: status.headRefName,
  };
}

export function pullRequestReviewSubjectFromPane(input: {
  number: number;
  title: string;
  url: string;
  state: string;
  forge: Forge;
  baseRefName: string;
  headRefName: string;
}): PullRequestReviewSubject | null {
  if (input.state === "merged") {
    return null;
  }
  return selectPullRequestReviewSubject({
    status: {
      number: input.number,
      url: input.url,
      title: input.title,
      state: input.state,
      baseRefName: input.baseRefName,
      headRefName: input.headRefName,
    },
    forge: input.forge,
  });
}

export function buildPullRequestReviewPrompt(input: {
  fileName: string;
  pullRequest: Pick<PullRequestReviewSubject, "number" | "title" | "url">;
}): string {
  return [
    `Review pull request #${input.pullRequest.number}: ${input.pullRequest.title}`,
    input.pullRequest.url,
    "",
    `Read the attached context file \`${input.fileName}\`. It has the pull request metadata, the changed files, and the diff. This workspace is checked out on the pull request branch.`,
    "",
    REVIEW_INSTRUCTIONS,
  ].join("\n");
}

/** `refs/remotes/origin/main` reads as `origin/main`; git accepts both. */
function shortRef(ref: string | null): string | null {
  return ref ? ref.replace(/^refs\/(heads|remotes)\//, "") : null;
}

export function buildLocalChangesReviewPrompt(input: {
  fileName: string;
  changes: LocalChangesReviewSubject;
}): string {
  const { branch } = input.changes;
  const baseRef = shortRef(input.changes.baseRef);
  const heading = branch
    ? `Review the local changes on branch \`${branch}\`.`
    : "Review the local changes in this workspace.";
  const scope = baseRef
    ? `the commits on this branch since it left \`${baseRef}\`, plus uncommitted and untracked changes`
    : "the uncommitted and untracked changes";
  return [
    heading,
    "",
    `Read the attached context file \`${input.fileName}\`. It has the changed files and the diff: ${scope}.`,
    "",
    REVIEW_INSTRUCTIONS,
  ].join("\n");
}

export function buildLocalChangesReviewContext(input: {
  changes: LocalChangesReviewSubject;
  files: readonly ParsedDiffFile[];
  diffTooLarge?: boolean;
  maxChars?: number;
}): { markdown: string; truncated: boolean } {
  const { branch } = input.changes;
  const baseRef = shortRef(input.changes.baseRef);
  const readHint = localChangesReadHint(input.changes);
  const preamble = [
    "# Local changes review context",
    "",
    "This file was generated for a code review chat. It is not part of the repository.",
    "",
    `- Branch: ${branch ?? "detached HEAD"}`,
    baseRef
      ? `- Compared with: merge base of ${baseRef}, including uncommitted and untracked changes`
      : "- Compared with: HEAD, uncommitted and untracked changes only",
    "",
    "## Changed files",
    "",
    ...changedFileLines(input.files),
    ...diffTooLargeLines(input.diffTooLarge === true, readHint),
  ].join("\n");
  return fitContext({
    preamble,
    sections: diffSections(input.files),
    cap: input.maxChars ?? PULL_REQUEST_REVIEW_CONTEXT_MAX_CHARS,
    omitted: omittedNote(readHint),
  });
}

export function buildPullRequestReviewContext(input: {
  pullRequest: PullRequestReviewSubject;
  files: readonly ParsedDiffFile[];
  diffTooLarge?: boolean;
  /** The workspace compares against another base, so the host could not load this diff. */
  baseMismatch?: boolean;
  maxChars?: number;
}): { markdown: string; truncated: boolean } {
  const readHint = `\`${pullRequestDiffCommand(input.pullRequest)}\``;
  return fitContext({
    preamble: buildPreamble({
      pullRequest: input.pullRequest,
      files: input.files,
      diffTooLarge: input.diffTooLarge === true,
      baseMismatch: input.baseMismatch === true,
      readHint,
    }),
    sections: diffSections(input.files),
    cap: input.maxChars ?? PULL_REQUEST_REVIEW_CONTEXT_MAX_CHARS,
    omitted: omittedNote(readHint),
  });
}

function diffSections(files: readonly ParsedDiffFile[]): string[] {
  return files.flatMap((file) => {
    const section = renderFileDiff(file);
    return section ? [section] : [];
  });
}

function changedFileLines(files: readonly ParsedDiffFile[]): string[] {
  return files.length === 0
    ? ["- No changed files."]
    : files.map((file) => formatFileSummary(file));
}

function diffTooLargeLines(diffTooLarge: boolean, readHint: string): string[] {
  return diffTooLarge
    ? ["", `The host could not load the full diff. Read the rest with ${readHint}.`]
    : [];
}

function readPullRequestNumber(status: PullRequestReviewStatus): number | null {
  if (status.number !== undefined && Number.isInteger(status.number) && status.number > 0) {
    return status.number;
  }
  try {
    const match = new URL(status.url).pathname.match(
      /\/(?:pull|pulls|merge_requests)\/(\d+)(?:\/|$)/,
    );
    if (!match) {
      return null;
    }
    const number = Number.parseInt(match[1] ?? "", 10);
    return Number.isInteger(number) && number > 0 ? number : null;
  } catch {
    return null;
  }
}

function buildPreamble(input: {
  pullRequest: PullRequestReviewSubject;
  files: readonly ParsedDiffFile[];
  diffTooLarge: boolean;
  baseMismatch: boolean;
  readHint: string;
}): string {
  const { pullRequest, files, readHint } = input;
  const fileLines = input.baseMismatch
    ? [
        `The host could not load the changed files or the diff, because the workspace compares against a different base than ${pullRequest.baseRef}. Read them with ${readHint}.`,
      ]
    : [...changedFileLines(files), ...diffTooLargeLines(input.diffTooLarge, readHint)];
  return [
    "# Pull request review context",
    "",
    "This file was generated for a code review chat. It is not part of the repository.",
    "",
    `- Pull request: #${pullRequest.number} ${pullRequest.title}`,
    `- URL: ${pullRequest.url}`,
    `- State: ${pullRequest.state}`,
    `- Forge: ${pullRequest.forgeLabel}`,
    `- Base: ${pullRequest.baseRef}`,
    `- Head: ${pullRequest.headRef}`,
    "",
    "## Changed files",
    "",
    ...fileLines,
  ].join("\n");
}

function formatFileSummary(file: ParsedDiffFile): string {
  const notes: string[] = [];
  if (file.isNew) notes.push("new");
  if (file.isDeleted) notes.push("deleted");
  if (file.oldPath && file.oldPath !== file.path) notes.push(`renamed from ${file.oldPath}`);
  if (file.status === "binary") notes.push("binary");
  if (file.status === "too_large") notes.push("diff too large to inline");
  const note = notes.length > 0 ? `, ${notes.join(", ")}` : "";
  return `- ${file.path} (+${file.additions} -${file.deletions}${note})`;
}

function renderFileDiff(file: ParsedDiffFile): string | null {
  if (file.status === "binary" || file.status === "too_large" || file.hunks.length === 0) {
    return null;
  }
  const hunks = file.hunks.map((hunk) => {
    const header = `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`;
    // The host includes the hunk's own `@@` line among its lines; the header above replaces it.
    const body = hunk.lines
      .filter((line) => line.type !== "header")
      .map((line) => formatDiffLine(line))
      .join("\n");
    return body.length > 0 ? `${header}\n${body}` : header;
  });
  return [`### ${file.path}`, "", "```diff", hunks.join("\n"), "```"].join("\n");
}

function formatDiffLine(line: ParsedDiffFile["hunks"][number]["lines"][number]): string {
  if (line.type === "header") {
    return line.content;
  }
  if (line.type === "add") {
    return `+${line.content}`;
  }
  if (line.type === "remove") {
    return `-${line.content}`;
  }
  return ` ${line.content}`;
}

function fitContext(input: {
  preamble: string;
  sections: readonly string[];
  cap: number;
  omitted: string;
}): { markdown: string; truncated: boolean } {
  const omitted = input.omitted;
  if (input.sections.length === 0) {
    const markdown = `${input.preamble}\n\n## Diff\n\nNo text diff to inline.`;
    return { markdown: clip(markdown, input.cap, omitted), truncated: markdown.length > input.cap };
  }

  let markdown = `${input.preamble}\n\n## Diff`;
  let included = 0;
  for (const section of input.sections) {
    const next = `${markdown}\n\n${section}`;
    const remaining = input.sections.length - included - 1;
    const reserved = remaining > 0 ? omitted.length : 0;
    if (next.length + reserved > input.cap) {
      break;
    }
    markdown = next;
    included += 1;
  }
  const truncated = included < input.sections.length;
  if (!truncated) {
    return { markdown, truncated: false };
  }
  const withNote = `${markdown}${omitted}`;
  if (withNote.length <= input.cap) {
    return { markdown: withNote, truncated: true };
  }
  return { markdown: clip(markdown, input.cap, omitted), truncated: true };
}

function clip(markdown: string, cap: number, omitted: string): string {
  if (markdown.length <= cap) {
    return markdown;
  }
  const note = omitted.startsWith("\n") ? omitted : `\n${omitted}`;
  const room = Math.max(0, cap - note.length);
  const clipped = `${markdown.slice(0, room).trimEnd()}${note}`;
  return clipped.length <= cap ? clipped : note.slice(0, cap);
}

function omittedNote(readHint: string): string {
  return [
    "",
    "## Omitted",
    "",
    `The rest of the diff was omitted because this context file reached its size cap. Read the remainder with ${readHint}.`,
  ].join("\n");
}

function pullRequestDiffCommand(pullRequest: PullRequestReviewSubject): string {
  return `git diff ${pullRequest.baseRef}...${pullRequest.headRef}`;
}

function localChangesReadHint(changes: LocalChangesReviewSubject): string {
  const baseRef = shortRef(changes.baseRef);
  const diff = baseRef ? `git diff $(git merge-base ${baseRef} HEAD)` : "git diff HEAD";
  return `\`${diff}\` and \`git status\` for untracked files`;
}
