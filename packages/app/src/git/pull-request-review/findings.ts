import { z } from "zod";

/**
 * Review chats save their findings as JSON in this directory of the workspace's `.context`, one
 * file per review. The Checks panel reads the newest one and lists its findings, each addable to
 * a chat, the way it lists forge comments.
 */
export const REVIEW_FINDINGS_DIR = ".context/reviews";

export interface ReviewFinding {
  title: string | null;
  /** Null for a finding about the change as a whole. */
  file: string | null;
  /** Null for a finding about the file or the change as a whole. */
  line: number | null;
  side: "old" | "new";
  body: string;
}

export interface ParsedReviewFindings {
  findings: ReviewFinding[];
  /** Entries that are not findings. */
  invalidCount: number;
}

const FindingSchema = z.object({
  title: z.string().trim().min(1).nullable().optional(),
  file: z.string().trim().min(1).nullable().optional(),
  line: z.number().int().positive().nullable().optional(),
  side: z.enum(["old", "new"]).optional(),
  body: z.string().trim().min(1),
});

const PROVIDER_SEPARATOR = "--";

/**
 * Names sort by time, so the newest review is the last name. The provider that ran the review
 * rides in the name, after `--`, so the Checks panel can show its icon.
 */
export function reviewFindingsFileName(input: {
  startedAt: Date;
  subject: string;
  provider?: string | null;
}): string {
  const stamp = input.startedAt.toISOString().replace(/[:.]/g, "-");
  const provider = input.provider?.replace(/[^A-Za-z0-9_-]/g, "") ?? "";
  return `${stamp}-${input.subject}${provider ? `${PROVIDER_SEPARATOR}${provider}` : ""}.json`;
}

/** The provider that ran the review, or null when the review started without one. */
export function reviewFindingsProvider(fileName: string): string | null {
  const stem = fileName.replace(/\.json$/, "");
  const index = stem.lastIndexOf(PROVIDER_SEPARATOR);
  return index === -1 ? null : stem.slice(index + PROVIDER_SEPARATOR.length) || null;
}

/** One line that identifies a finding: its title, or the start of its body. */
export function findingSummary(finding: ReviewFinding): string {
  return finding.title ?? finding.body.split("\n")[0] ?? finding.body;
}

export function reviewFindingsInstructions(path: string): string {
  return [
    `Also save every finding to \`${path}\` as a JSON array, creating the directory if needed. The user reads them in Paseo's Checks panel and adds the ones they want to a chat:`,
    "",
    "```json",
    '[{ "title": "Short title", "file": "src/example.ts", "line": 42, "side": "new", "body": "What is wrong, why it matters, and what to do." }]',
    "```",
    "",
    'List them highest risk first and leave none out, including test gaps and notes about code outside the diff. Use repository-relative paths. Give the file and line the finding is about, or `null` for both when it is about the change as a whole. Use "side": "old" with the old line number only for a removed line. Write the title and body as plain text. Write `[]` when there are none.',
  ].join("\n");
}

/** Null when the text is not a JSON array. */
export function parseReviewFindings(json: string): ParsedReviewFindings | null {
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
  return { findings, invalidCount };
}

/** Makes a finding's path repository-relative. */
export function normalizeFindingPath(file: string, cwd: string): string {
  const path = file.trim().replace(/\\/g, "/");
  const root = cwd.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  if (root && path.startsWith(`${root}/`)) {
    return path.slice(root.length + 1);
  }
  return path.replace(/^\.\//, "");
}

/** `src/a.ts:12`, `src/a.ts`, or null for a finding about the whole change. */
export function formatFindingLocation(finding: ReviewFinding, cwd: string): string | null {
  if (finding.file === null) return null;
  const path = normalizeFindingPath(finding.file, cwd);
  return finding.line === null ? path : `${path}:${finding.line}`;
}
