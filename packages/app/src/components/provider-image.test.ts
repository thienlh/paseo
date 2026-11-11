import { describe, expect, it } from "vitest";
import { splitProviderMessage } from "./provider-image";

const HASH = "a".repeat(64);
const IMAGE = `![Image](file:///tmp/paseo-attachments-test/${HASH}.png)`;

describe("splitProviderMessage", () => {
  it("splits prose and provider images into separate presentation blocks", () => {
    expect(
      splitProviderMessage(`Before\n\n${IMAGE}\n\nBetween\n\n${IMAGE}\n\nAfter`),
    ).toMatchObject([
      { kind: "markdown", text: "Before" },
      { kind: "image", source: `file:///tmp/paseo-attachments-test/${HASH}.png`, alt: "Image" },
      { kind: "markdown", text: "Between" },
      { kind: "image", source: `file:///tmp/paseo-attachments-test/${HASH}.png`, alt: "Image" },
      { kind: "markdown", text: "After" },
    ]);
  });

  it("leaves ordinary authored Markdown images in the Markdown renderer", () => {
    const text = "Before\n\n![Diagram](diagram.png)\n\nAfter";
    expect(splitProviderMessage(text)).toMatchObject([{ kind: "markdown", text }]);
  });
});
