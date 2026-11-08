import { describe, expect, it } from "vitest";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { readLatestReviewFindings } from "./use-review-findings";

type FindingsClient = Pick<DaemonClient, "listDirectory" | "readFile">;

function client(files: Record<string, string> | null): FindingsClient & { reads: string[] } {
  const reads: string[] = [];
  return {
    reads,
    listDirectory: async (_cwd, path) => {
      if (!files) throw new Error("ENOENT");
      return {
        path,
        entries: Object.keys(files).map((name) => ({
          name,
          path: `${path}/${name}`,
          kind: "file" as const,
          size: 1,
          modifiedAt: "2026-11-08T00:00:00.000Z",
        })),
      };
    },
    readFile: async (_cwd, path) => {
      reads.push(path);
      const name = path.split("/").at(-1) ?? "";
      return {
        bytes: new TextEncoder().encode(files?.[name] ?? ""),
        mime: "application/json",
        size: 1,
        path,
        kind: "text" as const,
        modifiedAt: "2026-11-08T00:00:00.000Z",
      };
    },
  };
}

describe("readLatestReviewFindings", () => {
  it("reads the newest review's file", async () => {
    const fake = client({
      "2026-11-08T09-00-00-000Z-local.json": "[]",
      "2026-11-08T10-00-00-000Z-pr-42--claude.json": JSON.stringify([
        { title: "Guard", file: "src/a.ts", line: 3, body: "Check it." },
      ]),
      "notes.md": "not findings",
    });

    expect(await readLatestReviewFindings(fake, "/repo")).toEqual({
      fileName: "2026-11-08T10-00-00-000Z-pr-42--claude.json",
      provider: "claude",
      findings: [{ title: "Guard", file: "src/a.ts", line: 3, side: "new", body: "Check it." }],
      invalidCount: 0,
      unreadable: false,
    });
    expect(fake.reads).toEqual([".context/reviews/2026-11-08T10-00-00-000Z-pr-42--claude.json"]);
  });

  it("returns nothing before any review has saved findings", async () => {
    expect(await readLatestReviewFindings(client(null), "/repo")).toBeNull();
    expect(await readLatestReviewFindings(client({}), "/repo")).toBeNull();
  });

  it("flags a file that is not a findings array", async () => {
    const fake = client({ "2026-11-08T10-00-00-000Z-local.json": "[{ half" });

    expect(await readLatestReviewFindings(fake, "/repo")).toMatchObject({
      findings: [],
      unreadable: true,
    });
  });
});
