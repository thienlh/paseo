import { describe, expect, it } from "vitest";
import {
  findingSummary,
  formatFindingLocation,
  normalizeFindingPath,
  parseReviewFindings,
  reviewFindingsFileName,
  reviewFindingsInstructions,
  reviewFindingsProvider,
} from "./findings";

describe("parseReviewFindings", () => {
  it("reads findings and fills in defaults", () => {
    expect(
      parseReviewFindings(
        JSON.stringify([
          { title: "Off by one", file: "src/a.ts", line: 12, side: "old", body: "Loop." },
          { file: "src/b.ts", line: 3, body: "Missing test." },
          { file: null, line: null, body: "No visual evidence." },
        ]),
      ),
    ).toEqual({
      invalidCount: 0,
      findings: [
        { title: "Off by one", file: "src/a.ts", line: 12, side: "old", body: "Loop." },
        { title: null, file: "src/b.ts", line: 3, side: "new", body: "Missing test." },
        { title: null, file: null, line: null, side: "new", body: "No visual evidence." },
      ],
    });
  });

  it("counts entries it cannot read and keeps the rest", () => {
    expect(
      parseReviewFindings(
        JSON.stringify([
          { file: "src/a.ts", line: 0, body: "Bad line." },
          { file: "src/a.ts", line: 4, body: "Good." },
          "not a finding",
        ]),
      ),
    ).toEqual({
      invalidCount: 2,
      findings: [{ title: null, file: "src/a.ts", line: 4, side: "new", body: "Good." }],
    });
  });

  it("rejects text that is not a JSON array", () => {
    expect(parseReviewFindings("[{ nope")).toBeNull();
    expect(parseReviewFindings('{ "findings": [] }')).toBeNull();
  });
});

describe("reviewFindingsFileName", () => {
  it("names files so the newest review sorts last", () => {
    const earlier = reviewFindingsFileName({
      startedAt: new Date("2026-11-08T09:05:00.000Z"),
      subject: "pr-42",
    });
    const later = reviewFindingsFileName({
      startedAt: new Date("2026-11-08T10:00:00.000Z"),
      subject: "local",
    });
    expect(earlier).toBe("2026-11-08T09-05-00-000Z-pr-42.json");
    expect([later, earlier].sort()).toEqual([earlier, later]);
  });
});

describe("reviewFindingsProvider", () => {
  it("reads the provider back from the file name", () => {
    const name = reviewFindingsFileName({
      startedAt: new Date("2026-11-08T09:05:00.000Z"),
      subject: "pr-42",
      provider: "claude",
    });
    expect(name).toBe("2026-11-08T09-05-00-000Z-pr-42--claude.json");
    expect(reviewFindingsProvider(name)).toBe("claude");
    expect(reviewFindingsProvider("2026-11-08T09-05-00-000Z-local.json")).toBeNull();
  });
});

describe("findingSummary", () => {
  it("uses the title, or the first line of the body", () => {
    const finding = { file: null, line: null, side: "new" as const };
    expect(findingSummary({ ...finding, title: "Guard", body: "Long text." })).toBe("Guard");
    expect(findingSummary({ ...finding, title: null, body: "First line.\nSecond." })).toBe(
      "First line.",
    );
  });
});

describe("reviewFindingsInstructions", () => {
  it("names the file to write", () => {
    expect(reviewFindingsInstructions("/repo/.context/reviews/r.json")).toContain(
      "`/repo/.context/reviews/r.json`",
    );
  });
});

describe("finding locations", () => {
  it("makes absolute and dot-relative paths repository-relative", () => {
    expect(normalizeFindingPath("/repo/src/a.ts", "/repo")).toBe("src/a.ts");
    expect(normalizeFindingPath("./src/a.ts", "/repo/")).toBe("src/a.ts");
  });

  it("formats a finding's location", () => {
    const finding = { title: null, side: "new" as const, body: "x" };
    expect(formatFindingLocation({ ...finding, file: "/repo/a.ts", line: 3 }, "/repo")).toBe(
      "a.ts:3",
    );
    expect(formatFindingLocation({ ...finding, file: "a.ts", line: null }, "/repo")).toBe("a.ts");
    expect(formatFindingLocation({ ...finding, file: null, line: null }, "/repo")).toBeNull();
  });
});
