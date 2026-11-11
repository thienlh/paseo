import type { AgentMessage } from "@getpaseo/protocol/agent-message";
import type { ToolCallDetail } from "@getpaseo/protocol/agent-types";
import { describe, expect, it } from "vitest";

import { buildToolCallPresentation, type ToolCallPresentationIcon } from "./presentation";

const fakeIcons = {
  paseo: (() => null) as ToolCallPresentationIcon,
  brain: (() => null) as ToolCallPresentationIcon,
  eye: (() => null) as ToolCallPresentationIcon,
  wrench: (() => null) as ToolCallPresentationIcon,
};

function fakeResolveIcon(
  toolName: string,
  detail: ToolCallDetail | undefined,
  agentMessage: AgentMessage | undefined,
): ToolCallPresentationIcon {
  if (agentMessage) {
    return fakeIcons.paseo;
  }
  if (detail?.type === "plan") {
    return fakeIcons.brain;
  }
  if (detail?.type === "read") {
    return fakeIcons.eye;
  }
  if (detail?.type === "plain_text" && detail.icon === "brain") {
    return fakeIcons.brain;
  }
  if (toolName === "exec_command") {
    return fakeIcons.wrench;
  }
  return fakeIcons.wrench;
}

describe("tool-call presentation", () => {
  it("builds badge, detail, icon, and file-open policy in one model", () => {
    const presentation = buildToolCallPresentation({
      toolName: "read_file",
      status: "completed",
      error: null,
      cwd: "/tmp/repo",
      detail: {
        type: "read",
        filePath: "/tmp/repo/src/index.ts",
        content: "console.log('hi');",
      },
      resolveIcon: fakeResolveIcon,
    });

    expect(presentation).toMatchObject({
      displayName: "Read 1 line",
      summary: "src/index.ts",
      icon: fakeIcons.eye,
      isLoadingDetails: false,
      hasDetails: true,
      canOpenDetails: true,
      openFilePath: "/tmp/repo/src/index.ts",
      isPlan: false,
    });
  });

  it("shows a shell call awaiting its command as Shell, loading its details", () => {
    const presentation = buildToolCallPresentation({
      toolName: "Bash",
      status: "running",
      error: null,
      detail: { type: "shell", command: "" },
      resolveIcon: fakeResolveIcon,
    });

    expect(presentation).toMatchObject({
      displayName: "Shell",
      summary: undefined,
      isLoadingDetails: true,
      hasDetails: false,
      canOpenDetails: true,
    });
  });

  it("includes additions and deletions from an edit's unified diff", () => {
    const presentation = buildToolCallPresentation({
      toolName: "edit_file",
      status: "completed",
      error: null,
      cwd: "/tmp/repo",
      detail: {
        type: "edit",
        filePath: "/tmp/repo/src/index.ts",
        unifiedDiff: "@@ -1,2 +1,3 @@\n old\n-removed\n+added one\n+added two",
      },
      resolveIcon: fakeResolveIcon,
    });
    expect(presentation).toMatchObject({
      summary: "src/index.ts",
      diffStat: { additions: 2, deletions: 1 },
    });
  });

  it("derives edit stats from old and new strings when no unified diff is available", () => {
    const presentation = buildToolCallPresentation({
      toolName: "edit_file",
      status: "completed",
      error: null,
      detail: {
        type: "edit",
        filePath: "src/index.ts",
        oldString: "one\nthree",
        newString: "one\ntwo\nthree",
      },
      resolveIcon: fakeResolveIcon,
    });
    expect(presentation.diffStat).toEqual({ additions: 1, deletions: 0 });
  });

  it("omits edit stats until the call has diff content", () => {
    const presentation = buildToolCallPresentation({
      toolName: "edit_file",
      status: "running",
      error: null,
      detail: { type: "edit", filePath: "src/index.ts" },
      resolveIcon: fakeResolveIcon,
    });
    expect(presentation.diffStat).toBeUndefined();
  });

  it("marks running calls without meaningful detail as loading details", () => {
    const presentation = buildToolCallPresentation({
      toolName: "exec_command",
      status: "running",
      error: null,
      detail: {
        type: "unknown",
        input: {},
        output: null,
      },
      resolveIcon: fakeResolveIcon,
    });

    expect(presentation).toMatchObject({
      displayName: "Exec command",
      icon: fakeIcons.wrench,
      isLoadingDetails: true,
      hasDetails: false,
      canOpenDetails: true,
      openFilePath: null,
      isPlan: false,
    });
  });

  it("keeps plan calls out of the expandable badge path", () => {
    const presentation = buildToolCallPresentation({
      toolName: "ExitPlanMode",
      status: "completed",
      error: null,
      detail: {
        type: "plan",
        text: "1. Do the thing",
      },
      resolveIcon: fakeResolveIcon,
    });

    expect(presentation.isPlan).toBe(true);
    expect(presentation.icon).toBe(fakeIcons.brain);
  });
});

it.each([
  ["message", "Message received"],
  ["finished", "Agent finished"],
  ["errored", "Agent errored"],
  ["permission-required", "Agent needs permission"],
  ["closed", "Agent closed"],
] as const)(
  "presents %s with a fixed label, the sender as context, and the Paseo icon",
  (event, heading) => {
    const presentation = buildToolCallPresentation({
      toolName: "internal_name_should_not_be_visible",
      status: "completed",
      error: null,
      detail: { type: "plain_text", label: "legacy summary", text: "legacy body", icon: "bot" },
      agentMessage: {
        event,
        sender: { id: "server::sender", title: "QA messenger" },
        text: "The delivered message.",
      },
      resolveIcon: fakeResolveIcon,
    });
    expect(presentation.displayName).toBe(heading);
    expect(presentation.summary).toBe("QA messenger");
    expect(presentation.icon).toBe(fakeIcons.paseo);
    expect(presentation.detail).toEqual({
      type: "plain_text",
      text: "From agent: server::sender\n\nThe delivered message.",
    });
  },
);

it("uses an opaque sender ID when no title is available", () => {
  const presentation = buildToolCallPresentation({
    toolName: "agent_message",
    status: "completed",
    error: null,
    agentMessage: { event: "message", sender: { id: "remote::worker" }, text: "Hello" },
    resolveIcon: fakeResolveIcon,
  });
  expect(presentation.displayName).toBe("Message received");
  expect(presentation.summary).toBe("remote::worker");
});

it("hides a pending AskUserQuestion so the tool name is not shown beside the form", () => {
  const presentation = buildToolCallPresentation({
    toolName: "AskUserQuestion",
    status: "running",
    error: null,
    detail: {
      type: "unknown",
      input: { questions: [{ question: "Which library?", header: "Library" }] },
      output: null,
    },
    resolveIcon: fakeResolveIcon,
  });

  expect(presentation.pendingQuestion).toBe(true);
  expect(presentation.answeredQuestion).toBeUndefined();
});

it("shows settled AskUserQuestion answers instead of the tool name", () => {
  const presentation = buildToolCallPresentation({
    toolName: "AskUserQuestion",
    status: "completed",
    error: null,
    detail: {
      type: "unknown",
      input: {
        questions: [{ question: "Which library should we use?", header: "Library" }],
      },
      output: { answers: { "Which library should we use?": "date-fns" } },
    },
    resolveIcon: fakeResolveIcon,
  });

  expect(presentation.displayName).toBe("[ANSWERED]");
  expect(presentation.summary).toBe("date-fns");
  expect(presentation.answeredQuestion).toEqual({
    label: "[ANSWERED]",
    entries: [{ question: "Which library should we use?", answer: "date-fns" }],
  });
  expect(presentation.detail).toEqual({
    type: "plain_text",
    label: "date-fns",
    text: "[ANSWERED]\n1. date-fns",
    icon: "brain",
  });
  expect(presentation.icon).toBe(fakeIcons.brain);
  expect(presentation.errorText).toBeUndefined();
  expect(presentation.questionCancelled).toBeUndefined();
});

it("marks the picked AskUserQuestion option and keeps the others", () => {
  const presentation = buildToolCallPresentation({
    toolName: "AskUserQuestion",
    status: "completed",
    error: null,
    detail: {
      type: "unknown",
      input: {
        questions: [
          {
            question: "Which library should we use?",
            header: "Library",
            options: [{ label: "date-fns", description: "Small date helpers" }, { label: "luxon" }],
          },
        ],
      },
      output: { answers: { "Which library should we use?": "date-fns" } },
    },
    resolveIcon: fakeResolveIcon,
  });

  expect(presentation.answeredQuestion?.entries).toEqual([
    {
      question: "Which library should we use?",
      answer: "date-fns",
      options: [
        { label: "date-fns", description: "Small date helpers", selected: true },
        { label: "luxon", selected: false },
      ],
    },
  ]);
});

it("marks the option named in Claude's AskUserQuestion tool result sentence", () => {
  const presentation = buildToolCallPresentation({
    toolName: "AskUserQuestion",
    status: "completed",
    error: null,
    detail: {
      type: "unknown",
      input: {
        questions: [
          {
            question: "Which library should we use?",
            header: "Library",
            options: [{ label: "date-fns" }, { label: "luxon" }],
          },
        ],
      },
      output: {
        output:
          'User has answered your questions: "Which library should we use?"="luxon". You can now continue with the user\'s answers in mind.',
      },
    },
    resolveIcon: fakeResolveIcon,
  });

  expect(presentation.summary).toBe("luxon");
  expect(presentation.answeredQuestion?.entries[0]?.options).toEqual([
    { label: "date-fns", selected: false },
    { label: "luxon", selected: true },
  ]);
});

it("shows a dismissed AskUserQuestion as cancelled, not a failed tool", () => {
  const presentation = buildToolCallPresentation({
    toolName: "AskUserQuestion",
    status: "failed",
    error: { message: "Dismissed by user" },
    detail: {
      type: "unknown",
      input: { questions: [{ question: "Which library should we use?", header: "Library" }] },
      output: null,
    },
    resolveIcon: fakeResolveIcon,
  });

  expect(presentation.displayName).toBe("[CANCELLED]");
  expect(presentation.summary).toBe("Which library should we use?");
  expect(presentation.answeredQuestion).toEqual({
    label: "[CANCELLED]",
    entries: [{ question: "Which library should we use?" }],
  });
  expect(presentation.detail).toMatchObject({
    type: "plain_text",
    text: "[CANCELLED]\n\nWhich library should we use?",
  });
  expect(presentation.errorText).toBeUndefined();
  expect(presentation.questionCancelled).toBe(true);
});

it("shows the target agent title as context for Paseo agent tools", () => {
  const presentation = buildToolCallPresentation({
    toolName: "mcp__paseo__kill_agent",
    status: "completed",
    error: null,
    detail: { type: "unknown", input: { agentId: "agt_1" }, output: null },
    targetAgentTitle: "Reviewer",
    resolveIcon: fakeResolveIcon,
  });
  expect(presentation.displayName).toBe("Kill agent");
  expect(presentation.summary).toBe("Reviewer");
});
