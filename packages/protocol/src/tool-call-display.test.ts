import { describe, expect, it } from "vitest";

import { buildToolCallDisplayModel } from "./tool-call-display.js";

describe("shared tool-call display mapping", () => {
  it("builds summary from canonical detail", () => {
    const display = buildToolCallDisplayModel({
      name: "read_file",
      status: "running",
      error: null,
      detail: {
        type: "read",
        filePath: "/tmp/repo/src/index.ts",
      },
      cwd: "/tmp/repo",
    });

    expect(display).toEqual({
      displayName: "Read",
      summary: "src/index.ts",
    });
  });

  it.each([
    [{ content: "first\nsecond\nthird", limit: 200 }, "Read 3 lines"],
    [{ content: "first\nsecond\n", limit: 200 }, "Read 2 lines"],
    [{ content: "", limit: 200 }, "Read 0 lines"],
    [{ limit: 1 }, "Read 1 line"],
    [{ limit: 155 }, "Read 155 lines"],
  ])("includes the available read line count in the label: %o", (read, displayName) => {
    const display = buildToolCallDisplayModel({
      name: "read_file",
      status: "completed",
      error: null,
      detail: { type: "read", filePath: "/tmp/repo/src/index.ts", ...read },
      cwd: "/tmp/repo",
    });
    expect(display).toEqual({ displayName, summary: "src/index.ts" });
  });

  it("includes the write line count", () => {
    const display = buildToolCallDisplayModel({
      name: "Write",
      status: "completed",
      error: null,
      detail: {
        type: "write",
        filePath: "/tmp/repo/src/provider-image.ts",
        content: "first\nsecond\nthird",
      },
      cwd: "/tmp/repo",
    });

    expect(display).toEqual({ displayName: "Write 3 lines", summary: "src/provider-image.ts" });
  });

  it("shows the first non-empty reasoning line beside Thinking", () => {
    const display = buildToolCallDisplayModel({
      name: "thinking",
      status: "running",
      error: null,
      detail: {
        type: "unknown",
        input: "\n  Check the generated patch first.  \nThen run the focused tests.",
        output: null,
      },
    });
    expect(display).toEqual({
      displayName: "Thinking",
      summary: "Check the generated patch first.",
    });
  });

  it("includes a failed shell call's exit code beside its command", () => {
    const display = buildToolCallDisplayModel({
      name: "Bash",
      status: "failed",
      error: null,
      detail: { type: "shell", command: "npm test", exitCode: 2 },
    });
    expect(display).toMatchObject({ displayName: "Shell", summary: "npm test · exit 2" });
  });

  it("does not infer summaries from unknown raw detail", () => {
    const display = buildToolCallDisplayModel({
      name: "exec_command",
      status: "running",
      error: null,
      detail: {
        type: "unknown",
        input: { command: "npm test" },
        output: null,
      },
    });

    expect(display).toEqual({
      displayName: "Exec command",
    });
  });

  it("uses sub-agent detail for task label and description", () => {
    const display = buildToolCallDisplayModel({
      name: "task",
      status: "running",
      error: null,
      detail: {
        type: "sub_agent",
        subAgentType: "Explore",
        description: "Inspect repository structure",
        log: "[Read] README.md",
      },
    });

    expect(display).toEqual({
      displayName: "Explore",
      summary: "Inspect repository structure",
    });
  });

  it("builds display model for worktree setup detail", () => {
    const display = buildToolCallDisplayModel({
      name: "paseo_worktree_setup",
      status: "running",
      error: null,
      detail: {
        type: "worktree_setup",
        worktreePath: "/tmp/repo/.paseo/worktrees/repo/branch",
        branchName: "feature-branch",
        log: "==> [1/1] Running: npm install\n",
        commands: [
          {
            index: 1,
            command: "npm install",
            cwd: "/tmp/repo/.paseo/worktrees/repo/branch",
            log: "==> [1/1] Running: npm install\n",
            status: "running",
            exitCode: null,
          },
        ],
      },
    });

    expect(display).toEqual({
      displayName: "Worktree setup",
      summary: "feature-branch",
    });
  });

  it("labels a shell call with the agent's description and keeps the command as summary", () => {
    const described = buildToolCallDisplayModel({
      name: "Bash",
      status: "completed",
      error: null,
      detail: { type: "shell", command: "git status", description: "Show working tree status" },
    });
    const bare = buildToolCallDisplayModel({
      name: "Bash",
      status: "completed",
      error: null,
      detail: { type: "shell", command: "git status", description: "  " },
    });

    expect(described).toMatchObject({
      displayName: "Show working tree status",
      summary: "git status",
    });
    expect(bare).toMatchObject({ displayName: "Shell", summary: "git status" });
  });

  it("provides errorText for failed calls", () => {
    const display = buildToolCallDisplayModel({
      name: "shell",
      status: "failed",
      error: { message: "boom" },
      detail: {
        type: "unknown",
        input: null,
        output: null,
      },
    });

    expect(display.errorText).toBe('{\n  "message": "boom"\n}');
  });

  it("labels terminal interaction rows without a summary when no command is available", () => {
    const display = buildToolCallDisplayModel({
      name: "terminal",
      status: "completed",
      error: null,
      detail: {
        type: "plain_text",
        icon: "square_terminal",
      },
    });

    expect(display).toEqual({
      displayName: "Terminal",
    });
  });

  it("uses the command as terminal interaction summary when available", () => {
    const display = buildToolCallDisplayModel({
      name: "terminal",
      status: "completed",
      error: null,
      detail: {
        type: "plain_text",
        label: "npm run test",
        icon: "square_terminal",
      },
    });

    expect(display).toEqual({
      displayName: "Terminal",
      summary: "npm run test",
    });
  });

  it("shows the method and server for an MCP tool call", () => {
    const display = buildToolCallDisplayModel({
      name: "mcp__Claude_Browser__computer",
      status: "completed",
      error: null,
      detail: { type: "unknown", input: null, output: null },
    });

    expect(display).toEqual({ displayName: "Computer", summary: "Claude Browser" });
  });

  it("humanizes Paseo MCP tool names (Claude Code format)", () => {
    const display = buildToolCallDisplayModel({
      name: "mcp__paseo__create_agent",
      status: "running",
      error: null,
      detail: { type: "unknown", input: null, output: null },
    });
    expect(display.displayName).toBe("Create agent");
  });

  it("humanizes Paseo MCP tool names (Codex format)", () => {
    const display = buildToolCallDisplayModel({
      name: "paseo.create_agent",
      status: "running",
      error: null,
      detail: { type: "unknown", input: null, output: null },
    });
    expect(display.displayName).toBe("Create agent");
  });

  it("humanizes list_agents Paseo tool", () => {
    const display = buildToolCallDisplayModel({
      name: "mcp__paseo__list_agents",
      status: "running",
      error: null,
      detail: { type: "unknown", input: null, output: null },
    });
    expect(display.displayName).toBe("List agents");
  });

  it("does not override speak tool display name", () => {
    const display = buildToolCallDisplayModel({
      name: "speak",
      status: "running",
      error: null,
      detail: { type: "unknown", input: null, output: null },
    });
    expect(display.displayName).toBe("Speak");
  });

  it("renders a settled AskUserQuestion as the user's answers", () => {
    const display = buildToolCallDisplayModel({
      name: "AskUserQuestion",
      status: "completed",
      error: null,
      detail: {
        type: "unknown",
        input: {
          questions: [
            { question: "Which library should we use?", header: "Library" },
            { question: "Where should it live?", header: "Placement" },
          ],
        },
        output: {
          output: {
            answers: {
              "Which library should we use?": "date-fns",
              Placement: "In the sidebar",
            },
          },
        },
      },
    });

    expect(display).toEqual({
      displayName: "[ANSWERED]",
      summary: "date-fns, In the sidebar",
    });
  });

  it("renders a dismissed AskUserQuestion as cancelled", () => {
    const display = buildToolCallDisplayModel({
      name: "mcp__conductor__AskUserQuestion",
      status: "failed",
      error: { message: "Dismissed by user" },
      detail: {
        type: "unknown",
        input: {
          questions: [{ question: "Which library should we use?", header: "Library" }],
        },
        output: null,
      },
    });

    expect(display).toEqual({
      displayName: "[CANCELLED]",
      summary: "Which library should we use?",
    });
  });

  it("leaves a pending AskUserQuestion on the generic tool label", () => {
    const display = buildToolCallDisplayModel({
      name: "AskUserQuestion",
      status: "running",
      error: null,
      detail: {
        type: "unknown",
        input: { questions: [{ question: "Which library?", header: "Library" }] },
        output: null,
      },
    });

    expect(display.displayName).toBe("Askuserquestion");
  });

  it("labels plan detail rows as Plan", () => {
    const display = buildToolCallDisplayModel({
      name: "plan",
      status: "completed",
      error: null,
      detail: {
        type: "plan",
        text: "### Login Screen\n- Build layout",
      },
    });

    expect(display).toEqual({
      displayName: "Plan",
    });
  });
});
