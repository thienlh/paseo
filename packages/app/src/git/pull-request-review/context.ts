import type { ParsedDiffFile } from "@getpaseo/protocol/messages";
import { getForgePresentation, normalizeForge, type Forge } from "@/git/forge";

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
    "Write a code review in this chat. Lead with the highest-risk findings. Cover correctness, regressions, missing tests, and unnecessary complexity. Cite file paths and line numbers. Skip praise and style nits unless they hide a defect. Do not edit the code.",
  ].join("\n");
}

export function buildPullRequestReviewContext(input: {
  pullRequest: PullRequestReviewSubject;
  files: readonly ParsedDiffFile[];
  diffTooLarge?: boolean;
  maxChars?: number;
}): { markdown: string; truncated: boolean } {
  const cap = input.maxChars ?? PULL_REQUEST_REVIEW_CONTEXT_MAX_CHARS;
  const preamble = buildPreamble(input.pullRequest, input.files, input.diffTooLarge === true);
  const sections = input.files.flatMap((file) => {
    const section = renderFileDiff(file);
    return section ? [section] : [];
  });
  return fitContext({ preamble, sections, cap, pullRequest: input.pullRequest });
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

function buildPreamble(
  pullRequest: PullRequestReviewSubject,
  files: readonly ParsedDiffFile[],
  diffTooLarge: boolean,
): string {
  const fileLines =
    files.length === 0 ? ["- No changed files."] : files.map((file) => formatFileSummary(file));
  const lines = [
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
  ];
  if (diffTooLarge) {
    lines.push(
      "",
      `The host could not load the full diff. Read the rest with \`${diffCommand(pullRequest)}\`.`,
    );
  }
  return lines.join("\n");
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
    const body = hunk.lines.map((line) => formatDiffLine(line)).join("\n");
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
  pullRequest: PullRequestReviewSubject;
}): { markdown: string; truncated: boolean } {
  const omitted = omittedNote(input.pullRequest);
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

function omittedNote(pullRequest: PullRequestReviewSubject): string {
  return [
    "",
    "## Omitted",
    "",
    `The rest of the diff was omitted because this context file reached its size cap. Read the remainder with \`${diffCommand(pullRequest)}\`.`,
  ].join("\n");
}

function diffCommand(pullRequest: PullRequestReviewSubject): string {
  return `git diff ${pullRequest.baseRef}...${pullRequest.headRef}`;
}
