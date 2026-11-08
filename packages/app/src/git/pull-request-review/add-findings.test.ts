import { beforeEach, describe, expect, it } from "vitest";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { ParsedDiffFile } from "@getpaseo/protocol/messages";
import {
  resolveWorkingDiffComparison,
  resetWorkingDiffComparisons,
} from "@/git/working-diff-comparison";
import { buildReviewDraftKey, getReviewDraftComments, resetReviewDraftStore } from "@/review/store";
import { addReviewFindingsToChanges } from "./add-findings";

const changedFile: ParsedDiffFile = {
  path: "src/app.ts",
  isNew: false,
  isDeleted: false,
  additions: 1,
  deletions: 1,
  hunks: [
    {
      oldStart: 10,
      oldCount: 2,
      newStart: 10,
      newCount: 2,
      lines: [
        { type: "context", content: "const ready = true;" },
        { type: "remove", content: "return false;" },
        { type: "add", content: "return ready;" },
      ],
    },
  ],
};

type DiffCompare = Parameters<DaemonClient["getCheckoutDiff"]>[1];

function client(input?: { error?: string; files?: ParsedDiffFile[] }) {
  const requests: DiffCompare[] = [];
  const fake: Pick<DaemonClient, "getCheckoutDiff"> = {
    getCheckoutDiff: async (_cwd, compare) => {
      requests.push(compare);
      return {
        cwd: "/repo",
        files: input?.files ?? [changedFile],
        error: input?.error ? { code: "UNKNOWN" as const, message: input.error } : null,
        requestId: "diff-1",
      };
    },
  };
  return { fake, requests };
}

const scope = { serverId: "server-1", workspaceId: "workspace-1", cwd: "/repo" };

function draftKey(mode: "all" | "uncommitted", baseRef?: string) {
  return buildReviewDraftKey({ ...scope, mode, baseRef, ignoreWhitespace: false });
}

beforeEach(() => {
  resetReviewDraftStore();
  resetWorkingDiffComparisons();
});

describe("addReviewFindingsToChanges", () => {
  it("adds findings on changed lines as comments under the Changes pane's key", async () => {
    const { fake, requests } = client();
    const result = await addReviewFindingsToChanges({
      client: fake,
      ...scope,
      baseRef: "origin/main",
      ignoreWhitespace: false,
      findings: [
        { title: null, file: "/repo/src/app.ts", line: 11, side: "new", body: "Check the guard." },
        { title: null, file: "src/app.ts", line: 11, side: "old", body: "Why was this removed?" },
      ],
    });

    expect(result).toEqual({ added: 2, moved: 0, offDiff: 0 });
    expect(requests).toEqual([{ mode: "all", baseRef: "origin/main", ignoreWhitespace: false }]);
    expect(
      getReviewDraftComments(draftKey("all", "origin/main"))?.map((comment) => ({
        filePath: comment.filePath,
        side: comment.side,
        lineNumber: comment.lineNumber,
        body: comment.body,
      })),
    ).toEqual([
      { filePath: "src/app.ts", side: "new", lineNumber: 11, body: "Check the guard." },
      { filePath: "src/app.ts", side: "old", lineNumber: 11, body: "Why was this removed?" },
    ]);
    expect(resolveWorkingDiffComparison(scope)).toBe("all");
  });

  it("puts findings off the diff on the nearest diff line and names their real location", async () => {
    const { fake } = client();
    const result = await addReviewFindingsToChanges({
      client: fake,
      ...scope,
      baseRef: "origin/main",
      ignoreWhitespace: false,
      findings: [
        { title: null, file: "src/app.ts", line: 99, side: "new", body: "Unchanged line." },
        { title: null, file: "src/other.ts", line: 1, side: "new", body: "Not in the diff." },
        { title: null, file: "src/app.ts", line: null, side: "new", body: "No tests cover this." },
        { title: null, file: null, line: null, side: "new", body: "Add a screenshot to the PR." },
      ],
    });

    expect(result).toEqual({ added: 4, moved: 4, offDiff: 0 });
    expect(
      getReviewDraftComments(draftKey("all", "origin/main"))?.map((comment) => ({
        filePath: comment.filePath,
        side: comment.side,
        lineNumber: comment.lineNumber,
        body: comment.body,
      })),
    ).toEqual([
      {
        filePath: "src/app.ts",
        side: "new",
        lineNumber: 11,
        body: "About line 99: Unchanged line.",
      },
      {
        filePath: "src/app.ts",
        side: "new",
        lineNumber: 11,
        body: "About src/other.ts:1: Not in the diff.",
      },
      { filePath: "src/app.ts", side: "new", lineNumber: 11, body: "No tests cover this." },
      { filePath: "src/app.ts", side: "new", lineNumber: 11, body: "Add a screenshot to the PR." },
    ]);
  });

  it("puts a finding's title above its body in the comment", async () => {
    const { fake } = client();
    await addReviewFindingsToChanges({
      client: fake,
      ...scope,
      baseRef: "origin/main",
      ignoreWhitespace: false,
      findings: [{ title: "Guard", file: "src/app.ts", line: 11, side: "new", body: "Check it." }],
    });

    expect(getReviewDraftComments(draftKey("all", "origin/main"))?.[0]?.body).toBe(
      "Guard\nCheck it.",
    );
  });

  it("falls back to another file when the finding's file has no lines to comment on", async () => {
    const binaryFile: ParsedDiffFile = {
      path: "assets/logo.png",
      isNew: false,
      isDeleted: false,
      additions: 0,
      deletions: 0,
      status: "binary",
      hunks: [],
    };
    const { fake } = client({ files: [binaryFile, changedFile] });
    const result = await addReviewFindingsToChanges({
      client: fake,
      ...scope,
      baseRef: "origin/main",
      ignoreWhitespace: false,
      findings: [
        { title: null, file: "assets/logo.png", line: 3, side: "new", body: "Too large." },
      ],
    });

    expect(result).toEqual({ added: 1, moved: 1, offDiff: 0 });
    expect(getReviewDraftComments(draftKey("all", "origin/main"))?.[0]).toMatchObject({
      filePath: "src/app.ts",
      side: "new",
      lineNumber: 11,
      body: "About assets/logo.png:3: Too large.",
    });
  });

  it("keeps one comment when a finding is added again", async () => {
    const { fake } = client();
    const finding = {
      title: null,
      file: "src/app.ts",
      line: 11,
      side: "new" as const,
      body: "Same.",
    };
    const add = () =>
      addReviewFindingsToChanges({
        client: fake,
        ...scope,
        baseRef: "origin/main",
        ignoreWhitespace: false,
        findings: [finding],
      });
    await add();

    expect(await add()).toEqual({ added: 1, moved: 0, offDiff: 0 });
    expect(getReviewDraftComments(draftKey("all", "origin/main"))).toHaveLength(1);
  });

  it("adds nothing when the diff is empty", async () => {
    const { fake } = client({ files: [] });
    const result = await addReviewFindingsToChanges({
      client: fake,
      ...scope,
      baseRef: "origin/main",
      ignoreWhitespace: false,
      findings: [{ title: null, file: "src/app.ts", line: 11, side: "new", body: "Check." }],
    });

    expect(result).toEqual({ added: 0, moved: 0, offDiff: 1 });
    expect(getReviewDraftComments(draftKey("all", "origin/main"))).toBeUndefined();
  });

  it("comments on uncommitted changes when the workspace has no base branch", async () => {
    const { fake, requests } = client();
    await addReviewFindingsToChanges({
      client: fake,
      ...scope,
      baseRef: undefined,
      ignoreWhitespace: false,
      findings: [{ title: null, file: "src/app.ts", line: 11, side: "new", body: "Check." }],
    });

    expect(requests).toEqual([{ mode: "uncommitted", ignoreWhitespace: false }]);
    expect(getReviewDraftComments(draftKey("uncommitted"))).toHaveLength(1);
    expect(resolveWorkingDiffComparison(scope)).toBe("uncommitted");
  });

  it("fails without adding anything when the diff cannot be loaded", async () => {
    const { fake } = client({ error: "diff failed" });
    await expect(
      addReviewFindingsToChanges({
        client: fake,
        ...scope,
        baseRef: "origin/main",
        ignoreWhitespace: false,
        findings: [{ title: null, file: "src/app.ts", line: 11, side: "new", body: "Check." }],
      }),
    ).rejects.toThrow("diff failed");
    expect(getReviewDraftComments(draftKey("all", "origin/main"))).toBeUndefined();
  });
});
