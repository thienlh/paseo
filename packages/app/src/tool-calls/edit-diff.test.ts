import { describe, expect, it } from "vitest";
import type { ToolCallDetail } from "@getpaseo/protocol/agent-types";
import { buildToolCallEditDiffStat } from "./edit-diff";

function editDetail(oldString: string, newString: string): ToolCallDetail {
  return { type: "edit", filePath: "src/large.ts", oldString, newString };
}

describe("bounded edit badge stats", () => {
  it("trims unchanged lines before comparing a large edit", () => {
    const oldText = Array.from({ length: 4000 }, (_, index) => `line ${index}`).join("\n");
    const newText = oldText.replace("line 2000", "line 2000 changed");
    expect(buildToolCallEditDiffStat(editDetail(oldText, newText))).toEqual({
      additions: 1,
      deletions: 1,
    });
  });

  it("omits stats for an oversized changed region instead of running a full diff", () => {
    const oldText = Array.from({ length: 4000 }, (_, index) => `old ${index}`).join("\n");
    const newText = Array.from({ length: 4000 }, (_, index) => `new ${index}`).join("\n");
    expect(buildToolCallEditDiffStat(editDetail(oldText, newText))).toBeUndefined();
  });

  it("reuses the cached result for an unchanged detail object", () => {
    const detail = editDetail("one\nthree", "one\ntwo\nthree");
    const first = buildToolCallEditDiffStat(detail);
    expect(buildToolCallEditDiffStat(detail)).toBe(first);
  });

  it("treats empty replacement text as zero lines", () => {
    expect(buildToolCallEditDiffStat(editDetail("", "hello"))).toEqual({
      additions: 1,
      deletions: 0,
    });
    expect(buildToolCallEditDiffStat(editDetail("hello", ""))).toEqual({
      additions: 0,
      deletions: 1,
    });
  });

  it("counts unified diff lines directly", () => {
    const detail: ToolCallDetail = {
      type: "edit",
      filePath: "src/index.ts",
      unifiedDiff: "@@ -1,2 +1,3 @@\n old\n-removed\n+added one\n+added two",
    };
    expect(buildToolCallEditDiffStat(detail)).toEqual({ additions: 2, deletions: 1 });
  });
});
