import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SettledQuestionEntry } from "@getpaseo/protocol/question-tool-display";

import { AnsweredQuestionCard } from "./answered-question-card";

beforeEach(() => vi.stubGlobal("React", React));

interface Mounted {
  root: Root;
  container: HTMLDivElement;
}

const mounted: Mounted[] = [];

afterEach(() => {
  for (const entry of mounted.splice(0)) {
    act(() => entry.root.unmount());
    entry.container.remove();
  }
});

function mount(node: React.ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(node));
  mounted.push({ root, container });
  return container;
}

describe("AnsweredQuestionCard", () => {
  it("renders an ANSWERED badge and reveals the question and answer on click", () => {
    const container = mount(
      <Harness
        status="answered"
        entries={[
          {
            question: "Which library should we use?",
            answer: "date-fns",
            options: [
              { label: "date-fns", description: "Small date helpers", selected: true },
              { label: "luxon", selected: false },
            ],
          },
        ]}
      />,
    );

    expect(container.textContent).not.toContain("User input");
    expect(container.querySelector("[data-testid=answered-question-stamp]")?.textContent).toBe(
      "ANSWERED",
    );
    expect(container.querySelector("[data-testid=answered-question-details]")).toBeNull();

    act(() => {
      container
        .querySelector("[data-testid=answered-question-badge]")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const details = container.querySelector("[data-testid=answered-question-details]");
    expect(details?.textContent).toContain("Which library should we use?");
    expect(details?.textContent).toContain("luxon");
    expect(details?.textContent).toContain("Small date helpers");
    expect(
      container.querySelector("[data-testid=answered-question-option-selected]")?.textContent,
    ).toContain("date-fns");
  });

  it("renders a CANCELLED badge and reveals the dismissed question", () => {
    const container = mount(
      <Harness status="cancelled" entries={[{ question: "Which library should we use?" }]} />,
    );

    expect(container.querySelector("[data-testid=answered-question-stamp]")?.textContent).toBe(
      "CANCELLED",
    );

    act(() => {
      container
        .querySelector("[data-testid=answered-question-badge]")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(
      container.querySelector("[data-testid=answered-question-details]")?.textContent,
    ).toContain("Which library should we use?");
  });
});

function Harness({
  status,
  entries,
}: {
  status: "answered" | "cancelled";
  entries: SettledQuestionEntry[];
}) {
  const [expanded, setExpanded] = React.useState(false);
  const onToggle = React.useCallback(() => {
    setExpanded((current) => !current);
  }, []);
  return (
    <AnsweredQuestionCard
      status={status}
      entries={entries}
      expanded={expanded}
      onToggle={onToggle}
    />
  );
}
