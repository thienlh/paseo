import { describe, expect, it } from "vitest";
import type { ParsedDiffFile } from "@getpaseo/protocol/messages";
import {
  buildLocalChangesReviewContext,
  buildLocalChangesReviewPrompt,
  buildPullRequestReviewContext,
  buildPullRequestReviewPrompt,
  pullRequestReviewContextFileName,
  pullRequestReviewSubjectFromPane,
  selectPullRequestReviewSubject,
  selectReviewSubject,
  type PullRequestReviewSubject,
} from "./context";
import { reviewFindingsInstructions } from "./findings";

const pullRequest: PullRequestReviewSubject = {
  number: 42,
  title: "Add review chat",
  url: "https://github.com/getpaseo/paseo/pull/42",
  state: "open",
  forgeLabel: "GitHub",
  baseRef: "main",
  headRef: "feature/review",
};

function file(overrides: Partial<ParsedDiffFile> = {}): ParsedDiffFile {
  return {
    path: "src/app.ts",
    isNew: false,
    isDeleted: false,
    additions: 1,
    deletions: 1,
    hunks: [
      {
        oldStart: 1,
        oldCount: 2,
        newStart: 1,
        newCount: 2,
        lines: [
          { type: "context", content: "const ready = true;" },
          { type: "remove", content: "return false;" },
          { type: "add", content: "return ready;" },
        ],
      },
    ],
    ...overrides,
  };
}

describe("selectPullRequestReviewSubject", () => {
  it("builds a review subject from an open pull request", () => {
    expect(
      selectPullRequestReviewSubject({
        status: {
          url: pullRequest.url,
          title: pullRequest.title,
          state: "open",
          baseRefName: "main",
          headRefName: "feature/review",
        },
        forge: "github",
      }),
    ).toEqual(pullRequest);
  });

  it("skips a merged pull request", () => {
    expect(
      selectPullRequestReviewSubject({
        status: {
          number: 42,
          url: pullRequest.url,
          title: pullRequest.title,
          state: "merged",
          isMerged: true,
          baseRefName: "main",
          headRefName: "feature/review",
        },
        forge: "github",
      }),
    ).toBeNull();
  });
});

describe("pull request review context", () => {
  it("writes the pull request, the file list, and a unified diff", () => {
    const context = buildPullRequestReviewContext({
      pullRequest,
      files: [file()],
    });

    expect(context).toEqual({
      truncated: false,
      markdown: [
        "# Pull request review context",
        "",
        "This file was generated for a code review chat. It is not part of the repository.",
        "",
        "- Pull request: #42 Add review chat",
        "- URL: https://github.com/getpaseo/paseo/pull/42",
        "- State: open",
        "- Forge: GitHub",
        "- Base: main",
        "- Head: feature/review",
        "",
        "## Changed files",
        "",
        "- src/app.ts (+1 -1)",
        "",
        "## Diff",
        "",
        "### src/app.ts",
        "",
        "```diff",
        "@@ -1,2 +1,2 @@",
        " const ready = true;",
        "-return false;",
        "+return ready;",
        "```",
      ].join("\n"),
    });
  });

  it("lists binary files without inlining them", () => {
    const context = buildPullRequestReviewContext({
      pullRequest,
      files: [
        file({
          path: "assets/logo.png",
          additions: 0,
          deletions: 0,
          status: "binary",
          isNew: true,
          hunks: [],
        }),
      ],
    });

    expect(context.truncated).toBe(false);
    expect(context.markdown).toContain("- assets/logo.png (+0 -0, new, binary)");
    expect(context.markdown).toContain("## Diff\n\nNo text diff to inline.");
    expect(context.markdown).not.toContain("```diff");
  });

  it("stops inlining diffs once the context file reaches its size cap", () => {
    const context = buildPullRequestReviewContext({
      pullRequest,
      files: [
        file({ path: "src/a.ts" }),
        file({
          path: "src/b.ts",
          additions: 400,
          deletions: 0,
          hunks: [
            {
              oldStart: 1,
              oldCount: 0,
              newStart: 1,
              newCount: 400,
              lines: Array.from({ length: 400 }, (_, index) => ({
                type: "add" as const,
                content: `const line${index} = ${index};`,
              })),
            },
          ],
        }),
      ],
      maxChars: 2_000,
    });

    expect(context.truncated).toBe(true);
    expect(context.markdown).toContain("### src/a.ts");
    expect(context.markdown).not.toContain("### src/b.ts");
    expect(context.markdown).toContain("git diff main...feature/review");
    expect(context.markdown.length).toBeLessThanOrEqual(2_000);
  });

  it("keeps a context file inside a cap smaller than the preamble", () => {
    const context = buildPullRequestReviewContext({
      pullRequest,
      files: [file({ path: "src/a.ts" })],
      maxChars: 80,
    });

    expect(context.truncated).toBe(true);
    expect(context.markdown.length).toBeLessThanOrEqual(80);
  });
});

describe("buildPullRequestReviewPrompt", () => {
  it("asks for a code review of the attached context file", () => {
    const fileName = pullRequestReviewContextFileName(42);
    const findingsPath = "/repo/.context/reviews/r.json";
    expect(buildPullRequestReviewPrompt({ fileName, findingsPath, pullRequest })).toBe(
      [
        "Review pull request #42: Add review chat",
        "https://github.com/getpaseo/paseo/pull/42",
        "",
        "Read the attached context file `pr-42-review-context.md`. It has the pull request metadata, the changed files, and the diff. This workspace is checked out on the pull request branch.",
        "",
        "Write a code review in this chat. Lead with the highest-risk findings. Cover correctness, regressions, missing tests, and unnecessary complexity. Cite file paths and line numbers. Skip praise and style nits unless they hide a defect. Do not edit the code; the findings file below is the only file you write.",
        "",
        reviewFindingsInstructions(findingsPath),
      ].join("\n"),
    );
  });
});

describe("pullRequestReviewSubjectFromPane", () => {
  it("hides the review action after the pull request merges", () => {
    expect(
      pullRequestReviewSubjectFromPane({
        number: 42,
        title: pullRequest.title,
        url: pullRequest.url,
        state: "merged",
        forge: "github",
        baseRefName: "main",
        headRefName: "feature/review",
      }),
    ).toBeNull();
  });
});

describe("selectReviewSubject", () => {
  it("prefers the open pull request", () => {
    expect(
      selectReviewSubject({
        pullRequest,
        isDirty: true,
        branch: "feature/review",
        baseRef: "main",
      }),
    ).toEqual({ kind: "pull_request", pullRequest });
  });

  it("reviews local changes when the workspace is dirty and has no pull request", () => {
    expect(
      selectReviewSubject({
        pullRequest: null,
        isDirty: true,
        branch: "feature/review",
        baseRef: "main",
      }),
    ).toEqual({ kind: "local_changes", changes: { branch: "feature/review", baseRef: "main" } });
  });

  it("treats a detached HEAD and a missing base as absent", () => {
    expect(
      selectReviewSubject({ pullRequest: null, isDirty: true, branch: "HEAD", baseRef: " " }),
    ).toEqual({ kind: "local_changes", changes: { branch: null, baseRef: null } });
  });

  it("hides the review when there is no pull request and nothing changed", () => {
    expect(
      selectReviewSubject({ pullRequest: null, isDirty: false, branch: "main", baseRef: "main" }),
    ).toBeNull();
  });
});

describe("local changes review", () => {
  it("names the branch and the comparison in the prompt", () => {
    expect(
      buildLocalChangesReviewPrompt({
        fileName: "local-changes-review-context.md",
        findingsPath: "/repo/.context/reviews/r.json",
        changes: { branch: "feature/review", baseRef: "main" },
      }),
    ).toContain(
      "the commits on this branch since it left `main`, plus uncommitted and untracked changes",
    );
    expect(
      buildLocalChangesReviewPrompt({
        fileName: "local-changes-review-context.md",
        findingsPath: "/repo/.context/reviews/r.json",
        changes: { branch: null, baseRef: null },
      }),
    ).toContain("Review the local changes in this workspace.");
    expect(
      buildLocalChangesReviewPrompt({
        fileName: "local-changes-review-context.md",
        findingsPath: "/repo/.context/reviews/r.json",
        changes: { branch: "feature/review", baseRef: "refs/remotes/origin/main" },
      }),
    ).toContain("since it left `origin/main`");
  });

  it("points at a merge-base diff when the context is truncated", () => {
    const { markdown, truncated } = buildLocalChangesReviewContext({
      changes: { branch: "feature/review", baseRef: "main" },
      files: Array.from({ length: 10 }, (_, index) => file({ path: `src/file-${index}.ts` })),
      maxChars: 1_200,
    });
    expect(truncated).toBe(true);
    expect(markdown.length).toBeLessThanOrEqual(1_200);
    expect(markdown).toContain("# Local changes review context");
    expect(markdown).toContain("`git diff $(git merge-base main HEAD)`");
  });
});

describe("diff rendering", () => {
  it("writes each hunk header once when the host includes it among the lines", () => {
    const { markdown } = buildLocalChangesReviewContext({
      changes: { branch: "feature/review", baseRef: "main" },
      files: [
        file({
          hunks: [
            {
              oldStart: 1,
              oldCount: 1,
              newStart: 1,
              newCount: 1,
              lines: [
                { type: "header", content: "@@ -1,1 +1,1 @@" },
                { type: "add", content: "return ready;" },
              ],
            },
          ],
        }),
      ],
    });
    expect(markdown.match(/@@ -1,1 \+1,1 @@/g)).toHaveLength(1);
    expect(markdown).toContain("@@ -1,1 +1,1 @@\n+return ready;");
  });
});
