import { z } from "zod";

/**
 * Review chats end with their findings in a fenced block of this language, so the app can turn
 * them into inline comments on the Changes diff. The chat shows a findings card instead of the
 * block; see `splitReviewFindings`.
 */
export const REVIEW_FINDINGS_FENCE = "paseo-review-findings";

export const REVIEW_FINDINGS_INSTRUCTIONS = [
  `The app shows your findings from a fenced code block with the language \`${REVIEW_FINDINGS_FENCE}\`, each with a button that adds it to the diff as a comment. So do not list the findings in your prose: write a short summary of the review, then end your reply with the block, a JSON array:`,
  "",
  "```" + REVIEW_FINDINGS_FENCE,
  '[{ "title": "Short title", "file": "src/example.ts", "line": 42, "side": "new", "body": "What is wrong, why it matters, and what to do." }]',
  "```",
  "",
  "Put every finding in this list, highest risk first: correctness, regressions, test gaps, risks, and notes about code outside the diff. Do not leave any out, even minor ones.",
  'Use repository-relative paths. Give the file and line the finding is about, even when the line is outside the diff. For a finding about the change as a whole, use `null` for both. Use "side": "old" with the old line number only for a removed line. Write the title and body as plain text. Write `[]` when there are none.',
].join("\n");

export interface ReviewFinding {
  title: string | null;
  /** Null for a finding about the change as a whole. */
  file: string | null;
  /** Null for a finding about the file or the change as a whole. */
  line: number | null;
  side: "old" | "new";
  body: string;
}

export type ReviewFindingsBlock =
  | { status: "none" }
  /** The block has started streaming but is not closed yet. */
  | { status: "pending" }
  | { status: "ready"; findings: ReviewFinding[]; invalidCount: number };

const FindingSchema = z.object({
  title: z.string().trim().min(1).nullable().optional(),
  file: z.string().trim().min(1).nullable().optional(),
  line: z.number().int().positive().nullable().optional(),
  side: z.enum(["old", "new"]).optional(),
  body: z.string().trim().min(1),
});

const OPENING_FENCE = new RegExp("(^|\\n)[ \\t]*```" + REVIEW_FINDINGS_FENCE + "[ \\t]*\\n");
const CLOSING_FENCE = /\n[ \t]*```[ \t]*(\n|$)/;

/**
 * Splits a review reply into the prose to show and the findings block it ends with. While the
 * reply streams, an unclosed block is pending. Once it has `settled`, an unclosed block is read
 * if it parses, and otherwise left in the text so the user sees what the agent wrote.
 */
export function splitReviewFindings(
  text: string,
  options: { settled?: boolean } = {},
): { text: string; block: ReviewFindingsBlock } {
  const opening = OPENING_FENCE.exec(text);
  if (!opening) {
    return { text, block: { status: "none" } };
  }
  const blockStart = opening.index + opening[1].length;
  const bodyStart = opening.index + opening[0].length;
  const prose = text.slice(0, blockStart).trimEnd();
  // Search from the newline that ended the opening fence, so an empty block still closes.
  const rest = text.slice(bodyStart - 1);
  const closing = CLOSING_FENCE.exec(rest);
  if (!closing) {
    if (!options.settled) {
      return { text: prose, block: { status: "pending" } };
    }
    const block = parseFindings(rest);
    return block ? { text: prose, block } : { text, block: { status: "none" } };
  }
  const json = rest.slice(0, closing.index);
  const after = rest.slice(closing.index + closing[0].length).trim();
  return {
    text: after ? `${prose}\n\n${after}` : prose,
    block: parseFindings(json) ?? { status: "ready", findings: [], invalidCount: 1 },
  };
}

/** Null when the block is not a JSON array. */
function parseFindings(json: string): Extract<ReviewFindingsBlock, { status: "ready" }> | null {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return null;
  }
  if (!Array.isArray(value)) {
    return null;
  }
  const findings: ReviewFinding[] = [];
  let invalidCount = 0;
  for (const entry of value) {
    const parsed = FindingSchema.safeParse(entry);
    if (!parsed.success) {
      invalidCount += 1;
      continue;
    }
    findings.push({
      title: parsed.data.title ?? null,
      file: parsed.data.file ?? null,
      line: parsed.data.line ?? null,
      side: parsed.data.side ?? "new",
      body: parsed.data.body,
    });
  }
  return { status: "ready", findings, invalidCount };
}

/** Makes a finding's path repository-relative, the form the diff uses. */
export function normalizeFindingPath(file: string, cwd: string): string {
  const path = file.trim().replace(/\\/g, "/");
  const root = cwd.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  if (root && path.startsWith(`${root}/`)) {
    return path.slice(root.length + 1);
  }
  return path.replace(/^\.\//, "");
}
