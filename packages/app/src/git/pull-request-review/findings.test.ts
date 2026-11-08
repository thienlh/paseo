import { describe, expect, it } from "vitest";
import { normalizeFindingPath, splitReviewFindings } from "./findings";

const prose = "Two findings, highest risk first.";

function reply(block: string): string {
  return `${prose}\n\n\`\`\`paseo-review-findings\n${block}\n\`\`\``;
}

describe("splitReviewFindings", () => {
  it("leaves a reply without a findings block alone", () => {
    expect(splitReviewFindings(prose)).toEqual({ text: prose, block: { status: "none" } });
  });

  it("strips the block and reads its findings", () => {
    const result = splitReviewFindings(
      reply(
        JSON.stringify([
          { title: null, file: "src/a.ts", line: 12, side: "new", body: "Off by one." },
          { title: null, file: "src/b.ts", line: 3, body: "Missing test." },
          { title: null, file: "src/c.ts", line: null, body: "About the whole change." },
          { title: null, file: null, line: null, body: "No visual evidence." },
        ]),
      ),
    );
    expect(result).toEqual({
      text: prose,
      block: {
        status: "ready",
        invalidCount: 0,
        findings: [
          { title: null, file: "src/a.ts", line: 12, side: "new", body: "Off by one." },
          { title: null, file: "src/b.ts", line: 3, side: "new", body: "Missing test." },
          {
            title: null,
            file: "src/c.ts",
            line: null,
            side: "new",
            body: "About the whole change.",
          },
          { title: null, file: null, line: null, side: "new", body: "No visual evidence." },
        ],
      },
    });
  });

  it("reads a finding's title", () => {
    const result = splitReviewFindings(
      reply(JSON.stringify([{ title: "Off by one", file: "src/a.ts", line: 2, body: "Loop." }])),
    );
    expect(result.block).toEqual({
      status: "ready",
      invalidCount: 0,
      findings: [{ title: "Off by one", file: "src/a.ts", line: 2, side: "new", body: "Loop." }],
    });
  });

  it("keeps prose that follows the block", () => {
    const result = splitReviewFindings(`${reply("[]")}\n\nThat's all.`);
    expect(result.text).toBe(`${prose}\n\nThat's all.`);
    expect(result.block).toEqual({ status: "ready", findings: [], invalidCount: 0 });
  });

  it("counts entries it cannot read and keeps the rest", () => {
    const result = splitReviewFindings(
      reply(
        JSON.stringify([
          { title: null, file: "src/a.ts", line: 0, body: "Bad line." },
          { title: null, file: "src/a.ts", line: 4, body: "Good." },
          "not a finding",
        ]),
      ),
    );
    expect(result.block).toEqual({
      status: "ready",
      invalidCount: 2,
      findings: [{ title: null, file: "src/a.ts", line: 4, side: "new", body: "Good." }],
    });
  });

  it("treats malformed JSON as one unreadable entry", () => {
    expect(splitReviewFindings(reply("[{ nope")).block).toEqual({
      status: "ready",
      findings: [],
      invalidCount: 1,
    });
  });

  it("hides a block that is still streaming", () => {
    expect(splitReviewFindings(`${prose}\n\n\`\`\`paseo-review-findings\n[{ "file": "src`)).toEqual(
      {
        text: prose,
        block: { status: "pending" },
      },
    );
  });

  it("reads an unclosed block once the reply has settled", () => {
    const text = `${prose}\n\n\`\`\`paseo-review-findings\n[{ "file": "src/a.ts", "line": 1, "body": "Bug." }]`;
    expect(splitReviewFindings(text, { settled: true })).toEqual({
      text: prose,
      block: {
        status: "ready",
        invalidCount: 0,
        findings: [{ title: null, file: "src/a.ts", line: 1, side: "new", body: "Bug." }],
      },
    });
  });

  it("shows a settled block that was cut off instead of hiding it", () => {
    const text = `${prose}\n\n\`\`\`paseo-review-findings\n[{ "file": "src`;
    expect(splitReviewFindings(text, { settled: true })).toEqual({
      text,
      block: { status: "none" },
    });
  });

  it("ignores ordinary code blocks", () => {
    const text = `${prose}\n\n\`\`\`json\n[]\n\`\`\``;
    expect(splitReviewFindings(text)).toEqual({ text, block: { status: "none" } });
  });
});

describe("normalizeFindingPath", () => {
  it("makes absolute and dot-relative paths repository-relative", () => {
    expect(normalizeFindingPath("/repo/src/a.ts", "/repo")).toBe("src/a.ts");
    expect(normalizeFindingPath("./src/a.ts", "/repo/")).toBe("src/a.ts");
    expect(normalizeFindingPath("src/a.ts", "/repo")).toBe("src/a.ts");
  });
});
