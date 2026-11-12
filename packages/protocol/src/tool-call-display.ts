import type { ToolCallTimelineItem } from "./agent-types.js";
import {
  buildAgentMessageDisplay,
  buildPaseoToolDisplay,
} from "./paseo-tool-presentation/index.js";
import { projectSettledAskUserQuestion } from "./question-tool-display.js";
import { stripCwdPrefix } from "./path-utils.js";
import {
  formatMcpMethodName,
  formatMcpServerName,
  parseMcpToolName,
} from "./tool-name-normalization.js";

export type ToolCallDisplayInput = Pick<
  ToolCallTimelineItem,
  "name" | "status" | "error" | "metadata" | "detail" | "agentMessage"
> & {
  cwd?: string;
  /** Title of the agent a Paseo call targets, when the caller knows it. */
  targetAgentTitle?: string;
};

export interface ToolCallDisplayModel {
  displayName: string;
  summary?: string;
  errorText?: string;
}

interface DetailDisplay {
  displayName?: string;
  summary?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function humanizeToolName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return name;
  }
  const mcp = parseMcpToolName(trimmed);
  if (mcp) return formatMcpMethodName(mcp.method);
  if (/[:./]/.test(trimmed) || trimmed.includes("__")) {
    return trimmed;
  }

  return trimmed
    .replace(/[._-]+/g, " ")
    .split(" ")
    .filter((segment) => segment.length > 0)
    .join(" ")
    .toLowerCase()
    .replace(/^./, (character) => character.toUpperCase());
}

function formatErrorText(error: unknown): string | undefined {
  if (error === null || error === undefined) {
    return undefined;
  }
  if (typeof error === "string") {
    return error;
  }
  if (isRecord(error) && typeof error.content === "string") {
    return error.content;
  }
  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}

function buildFilePathDisplay(
  displayName: string,
  filePath: string,
  cwd: string | undefined,
): DetailDisplay {
  return {
    displayName,
    summary: stripCwdPrefix(filePath, cwd),
  };
}

function readDisplayName(
  detail: Extract<ToolCallDisplayInput["detail"], { type: "read" }>,
): string {
  const count = detail.content === undefined ? detail.limit : contentLineCount(detail.content);
  if (count === undefined) return "Read";
  return `Read ${count} ${count === 1 ? "line" : "lines"}`;
}

function contentLineCount(content: string): number {
  if (content.length === 0) return 0;
  const lines = content.split(/\r\n|\r|\n/);
  return /\r\n$|\r$|\n$/.test(content) ? lines.length - 1 : lines.length;
}

function writeDisplayName(
  detail: Extract<ToolCallDisplayInput["detail"], { type: "write" }>,
): string {
  if (detail.content === undefined) return "Write";
  const count = contentLineCount(detail.content);
  return `Write ${count} ${count === 1 ? "line" : "lines"}`;
}

function firstNonEmptyLine(text: string): string | undefined {
  for (const line of text.split(/\r\n|\r|\n/)) {
    const trimmed = line.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function buildCanonicalDetailDisplay(input: ToolCallDisplayInput): DetailDisplay {
  switch (input.detail.type) {
    case "shell":
      return {
        displayName: nonEmpty(input.detail.description) ?? "Shell",
        summary:
          input.status === "failed" && typeof input.detail.exitCode === "number"
            ? `${input.detail.command} · exit ${input.detail.exitCode}`
            : input.detail.command,
      };
    case "read":
      return buildFilePathDisplay(readDisplayName(input.detail), input.detail.filePath, input.cwd);
    case "edit":
      return buildFilePathDisplay("Edit", input.detail.filePath, input.cwd);
    case "write":
      return buildFilePathDisplay(writeDisplayName(input.detail), input.detail.filePath, input.cwd);
    case "search":
      return {
        displayName: "Search",
        summary: input.detail.query,
      };
    case "fetch":
      return {
        displayName: "Fetch",
        summary: input.detail.url,
      };
    case "worktree_setup":
      return {
        displayName: "Worktree setup",
        summary: input.detail.branchName,
      };
    case "sub_agent":
      return {
        displayName: readString(input.detail.subAgentType) ?? "Task",
        summary: readString(input.detail.description),
      };
    case "plain_text":
      return {
        summary: input.detail.label,
      };
    case "plan":
      return {
        displayName: "Plan",
      };
    case "unknown":
      return {};
    default:
      throw new Error("unreachable");
  }
}

function firstCodeStatement(code: string): string | undefined {
  for (const line of code.split(/\r\n|\r|\n/)) {
    const trimmed = line.trim();
    if (
      !trimmed ||
      trimmed.startsWith("//") ||
      trimmed.startsWith("/*") ||
      trimmed.startsWith("*")
    ) {
      continue;
    }
    return trimmed;
  }
  return undefined;
}

function codeModeSummary(detail: ToolCallDisplayInput["detail"]): string | undefined {
  if (detail.type !== "unknown") return undefined;
  const input = detail.input;
  if (typeof input === "string") return firstCodeStatement(input);
  if (!isRecord(input)) return undefined;

  const invokedFunction =
    readString(input.toolName) ?? readString(input.function) ?? readString(input.method);
  if (invokedFunction) return invokedFunction;

  const code = readString(input.code) ?? readString(input.script) ?? readString(input.source);
  if (!code) return undefined;
  return firstCodeStatement(code) ?? `JavaScript · ${contentLineCount(code)} lines`;
}

function buildUnknownDetailOverride(input: ToolCallDisplayInput): DetailDisplay {
  const lowerName = input.name.trim().toLowerCase();
  if (lowerName === "codemode") {
    return {
      displayName: "Codemode",
      summary: codeModeSummary(input.detail),
    };
  }
  if (input.detail.type === "unknown" && lowerName === "task") {
    return {
      displayName: "Task",
      summary: isRecord(input.metadata) ? readString(input.metadata.subAgentActivity) : undefined,
    };
  }
  if (input.detail.type === "unknown" && lowerName === "thinking") {
    return {
      displayName: "Thinking",
      summary:
        typeof input.detail.input === "string" ? firstNonEmptyLine(input.detail.input) : undefined,
    };
  }
  if (lowerName === "terminal") {
    return {
      displayName: "Terminal",
      summary: input.detail.type === "plain_text" ? readString(input.detail.label) : undefined,
    };
  }
  return {};
}

export function buildToolCallDisplayModel(input: ToolCallDisplayInput): ToolCallDisplayModel {
  const settledQuestion = projectSettledAskUserQuestion(input);
  if (settledQuestion) {
    return {
      displayName: settledQuestion.displayName,
      ...(settledQuestion.summary ? { summary: settledQuestion.summary } : {}),
    };
  }
  const errorText = input.status === "failed" ? formatErrorText(input.error) : undefined;
  const paseoDisplay = input.agentMessage
    ? buildAgentMessageDisplay(input.agentMessage)
    : buildPaseoToolDisplay({
        toolName: input.name,
        detail: input.detail,
        targetAgentTitle: input.targetAgentTitle,
      });
  if (paseoDisplay) {
    return {
      displayName: paseoDisplay.displayName,
      ...(paseoDisplay.summary ? { summary: paseoDisplay.summary } : {}),
      ...(errorText ? { errorText } : {}),
    };
  }
  const canonicalDisplay = buildCanonicalDetailDisplay(input);
  const unknownDetailOverride = buildUnknownDetailOverride(input);
  const displayName =
    unknownDetailOverride.displayName ??
    canonicalDisplay.displayName ??
    humanizeToolName(input.name);
  const mcp = parseMcpToolName(input.name);
  const summary =
    unknownDetailOverride.summary ??
    canonicalDisplay.summary ??
    (mcp ? formatMcpServerName(mcp.server) : undefined);

  return {
    displayName,
    ...(summary ? { summary } : {}),
    ...(errorText ? { errorText } : {}),
  };
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
