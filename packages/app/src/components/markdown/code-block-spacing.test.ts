import { describe, expect, it } from "vitest";
import type { ReactElement } from "react";
import { blockRenderers } from "react-native-enriched-markdown/lib/module/web/renderers/BlockRenderers";
import type { RendererProps } from "react-native-enriched-markdown/src/web/types";

function renderCodeBlock(parentType: RendererProps["parentType"]): ReactElement<{
  style: { marginTop?: number; marginBottom?: number };
}> {
  const render = blockRenderers.CodeBlock;
  if (!render) throw new Error("Code block renderer is unavailable");
  return render({
    node: { type: "CodeBlock", attributes: { language: "bash" } },
    style: {} as RendererProps["style"],
    styles: {
      paragraph: { marginBottom: 16 },
      codeBlock: { marginTop: 0, marginBottom: 16 },
    } as RendererProps["styles"],
    parentType,
    callbacks: {},
    capabilities: {
      renderers: { codeBlock: () => null },
      katex: null,
      enableTaskListItemToggle: false,
    },
    renderChildren: () => null,
  }) as ReactElement<{ style: { marginTop?: number; marginBottom?: number } }>;
}

describe("code block spacing", () => {
  it("uses the paragraph gap before a code block inside a list item", () => {
    expect(renderCodeBlock("ListItem").props.style).toEqual({ marginTop: 16, marginBottom: 16 });
  });

  it("leaves top-level code block spacing unchanged", () => {
    expect(renderCodeBlock("Document").props.style).toEqual({ marginTop: 0, marginBottom: 16 });
  });
});
