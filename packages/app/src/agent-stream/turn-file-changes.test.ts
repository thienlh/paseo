import { describe, expect, it } from "vitest";
import type { ToolCallDetail } from "@getpaseo/protocol/agent-types";
import type { StreamItem, ThoughtItem, ToolCallItem } from "@/types/stream";
import {
  collectTurnFileChanges,
  createTurnCallsResolver,
  displayChangedFilePath,
  turnFileDiffLines,
} from "./turn-file-changes";

function toolCall(
  id: string,
  detail: ToolCallDetail,
  status: "completed" | "failed" = "completed",
): ToolCallItem {
  return {
    kind: "tool_call",
    id,
    timestamp: new Date("2026-11-08T00:00:00.000Z"),
    payload: {
      source: "agent",
      data: { provider: "claude", callId: id, name: "Edit", status, error: null, detail },
    },
  } as ToolCallItem;
}

describe("collectTurnFileChanges", () => {
  it("counts lines per file across the turn's edits and writes, in first-touch order", () => {
    const changes = collectTurnFileChanges([
      toolCall("1", {
        type: "edit",
        filePath: "/repo/src/a.ts",
        oldString: "one\ntwo",
        newString: "one\nTWO\nthree",
      }),
      toolCall("2", { type: "write", filePath: "/repo/src/b.ts", content: "x\ny\n" }),
      toolCall("3", {
        type: "edit",
        filePath: "/repo/src/a.ts",
        unifiedDiff: "--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new",
      }),
    ]);

    expect(
      changes.map(({ filePath, additions, deletions }) => ({ filePath, additions, deletions })),
    ).toEqual([
      { filePath: "/repo/src/a.ts", additions: 3, deletions: 2 },
      { filePath: "/repo/src/b.ts", additions: 2, deletions: 0 },
    ]);
    // The preview's diff is built on demand from both of the file's edits.
    const first = changes[0];
    expect(first?.edits).toHaveLength(2);
    expect(
      first &&
        turnFileDiffLines(first).some(
          (line) => line.type === "add" && line.content.endsWith("new"),
        ),
    ).toBe(true);
  });

  it("omits stats for an oversized changed region instead of building its full diff", () => {
    const oldText = Array.from({ length: 4000 }, (_, index) => `old ${index}`).join("\n");
    const newText = Array.from({ length: 4000 }, (_, index) => `new ${index}`).join("\n");

    expect(
      collectTurnFileChanges([
        toolCall("large", {
          type: "edit",
          filePath: "large.ts",
          oldString: oldText,
          newString: newText,
        }),
      ]),
    ).toEqual([]);
  });

  it("reads through rows that stand for other calls, such as a folded turn", () => {
    const hidden = toolCall("1", {
      type: "edit",
      filePath: "a.ts",
      oldString: "a",
      newString: "b",
    });
    const summary = { kind: "turn_summary", id: "summary" } as StreamItem;

    const changes = collectTurnFileChanges([summary], (row) =>
      row.id === "summary" ? [hidden] : [row],
    );

    expect(changes.map((change) => change.filePath)).toEqual(["a.ts"]);
  });

  it("reads changed files through a group hosted by a thought", () => {
    const thought: ThoughtItem = {
      kind: "thought",
      id: "thought",
      text: "Done",
      status: "ready",
      timestamp: new Date("2026-11-08T00:00:01.000Z"),
    };
    const groupedCalls = [
      toolCall("edit", { type: "edit", filePath: "a.ts", oldString: "a", newString: "b" }),
      thought,
    ] as const;
    const resolveCalls = createTurnCallsResolver({
      groupsByHostId: new Map([["thought", { run: { calls: groupedCalls } }]]),
      turns: { foldedCallsByHostId: new Map() },
    });

    expect(
      collectTurnFileChanges([thought], resolveCalls).map((change) => change.filePath),
    ).toEqual(["a.ts"]);
  });

  it("ignores failed calls, reads, and edits that changed nothing", () => {
    expect(
      collectTurnFileChanges([
        toolCall("1", { type: "edit", filePath: "a.ts", oldString: "a", newString: "b" }, "failed"),
        toolCall("2", { type: "read", filePath: "a.ts" }),
        toolCall("3", { type: "edit", filePath: "a.ts", oldString: "same", newString: "same" }),
      ]),
    ).toEqual([]);
  });
});

describe("displayChangedFilePath", () => {
  it("shows workspace files relative to the workspace", () => {
    expect(displayChangedFilePath("/repo/src/a.ts", "/repo/")).toBe("src/a.ts");
    expect(displayChangedFilePath("/tmp/notes.md", "/repo")).toBe("/tmp/notes.md");
    expect(displayChangedFilePath("src/a.ts", undefined)).toBe("src/a.ts");
  });
});
