import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { i18n } from "@/i18n/i18next";
import type { TurnTiming } from "@/timeline/turn-time";
import type { StreamItem } from "@/types/stream";
import { createNativeStreamStrategy } from "./strategy-native";
import { CompletedTurnFooterRow } from "./turn-footer";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

// A Sunday, so a turn that ended on Friday shows a weekday timestamp.
const NOW = new Date(2026, 10, 8, 5, 0);
const FRIDAY_NIGHT = new Date(2026, 10, 6, 23, 11);

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  host = document.createElement("div");
  host.style.width = "880px";
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  await i18n.changeLanguage("en");
  vi.unstubAllGlobals();
});

const reply: StreamItem = {
  kind: "assistant_message",
  id: "reply",
  text: "Done.",
  timestamp: FRIDAY_NIGHT,
};

function renderCompletedFooter(timing: TurnTiming, items: StreamItem[] = [reply]): void {
  act(() =>
    root.render(
      <CompletedTurnFooterRow
        strategy={createNativeStreamStrategy()}
        items={items}
        timing={timing}
        startIndex={items.length - 1}
        supportsTimelineCursor={false}
      />,
    ),
  );
}

function editedFile(id: string, filePath: string): StreamItem {
  return {
    kind: "tool_call",
    id,
    timestamp: FRIDAY_NIGHT,
    payload: {
      source: "agent",
      data: {
        provider: "claude",
        callId: id,
        name: "Edit",
        status: "completed",
        error: null,
        detail: { type: "edit", filePath, oldString: "a", newString: "b" },
      },
    },
  } as StreamItem;
}

/** How many painted lines each footer label takes. */
function paintedLinesByLabel(element: HTMLElement): Record<string, number> {
  const lines: Record<string, number> = {};
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const text = walker.currentNode.textContent ?? "";
    if (!text.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(walker.currentNode);
    lines[text] = new Set(Array.from(range.getClientRects(), (rect) => Math.round(rect.top))).size;
  }
  return lines;
}

// The footer shows the duration and swaps to the end timestamp on hover or tap. Neither label
// may be sized by the other: a timestamp with more characters can still paint narrower.
it.each([
  {
    language: "en",
    timing: { completedAt: FRIDAY_NIGHT, durationMs: 26_000 },
    duration: "Worked for 26s",
  },
  // CJK glyphs make the shorter string paint wider in every font.
  {
    language: "ja",
    timing: { completedAt: FRIDAY_NIGHT, durationMs: 59 * 60_000 + 58_000 },
    duration: "作業時間 59m 58s",
  },
])("keeps both timing labels on one line when the chat has room ($language)", async (input) => {
  await i18n.changeLanguage(input.language);

  renderCompletedFooter(input.timing);

  expect(paintedLinesByLabel(host)).toEqual({
    [input.duration]: 1,
    "Friday 11:11 PM": 1,
  });
});

it("keeps the duration on one line when changed files compete for a narrow footer", () => {
  host.style.width = "240px";
  const paths = [
    "src/client.py",
    "src/run.py",
    "src/generate_fakes.py",
    "src/test_track_client.py",
    "src/test_generate_model.py",
    "src/COMPONENTS.md",
  ];
  renderCompletedFooter({ completedAt: FRIDAY_NIGHT, durationMs: 5 * 60_000 + 8_000 }, [
    ...paths.map((path) => editedFile(path, path)),
    reply,
  ]);
  expect(paintedLinesByLabel(host)["Worked for 5m 8s"]).toBe(1);
  const label = host.querySelector("[data-testid=turn-footer-timing-label]")!;
  const fileRow = host.querySelector("[data-testid=turn-file-changes]")!;
  expect(fileRow.getBoundingClientRect().top).toBeGreaterThanOrEqual(
    label.getBoundingClientRect().bottom,
  );
});
