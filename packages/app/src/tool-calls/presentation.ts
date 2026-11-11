import type { AgentMessage } from "@getpaseo/protocol/agent-message";
import { buildAgentMessageDisplay } from "@getpaseo/protocol/paseo-tool-presentation/index";
import {
  isAskUserQuestionToolName,
  projectSettledAskUserQuestion,
  type SettledQuestionEntry,
} from "@getpaseo/protocol/question-tool-display";
import type { PlanOutcome } from "@/components/plan-card";
import type { ComponentType } from "react";
import type { ToolCallDetail } from "@getpaseo/protocol/agent-types";
import {
  buildToolCallDisplayModel,
  type ToolCallDisplayInput,
} from "@getpaseo/protocol/tool-call-display";
import { extractToolCallFilePath } from "@/utils/extract-tool-call-file-path";
import { buildToolCallEditDiffStat, type ToolCallEditDiffStat } from "./edit-diff";
import {
  hasMeaningfulToolCallDetail,
  isPendingToolCallDetail,
} from "@/utils/tool-call-detail-state";

type ToolCallStatus = "executing" | "running" | "completed" | "failed" | "canceled";
export type ToolCallPresentationIcon = ComponentType<{ size?: number; color?: string }>;

interface BuildToolCallPresentationInput {
  agentMessage?: AgentMessage;
  toolName: string;
  status: ToolCallStatus;
  error: unknown;
  detail?: ToolCallDetail;
  cwd?: string;
  metadata?: Record<string, unknown>;
  targetAgentTitle?: string;
  resolveIcon: ToolCallIconResolver;
}

export interface ToolCallPresentation {
  detail: ToolCallDetail | undefined;
  displayName: string;
  summary?: string;
  errorText?: string;
  diffStat?: ToolCallEditDiffStat;
  icon: ToolCallPresentationIcon;
  isLoadingDetails: boolean;
  hasDetails: boolean;
  canOpenDetails: boolean;
  openFilePath: string | null;
  isPlan: boolean;
  planOutcome?: PlanOutcome;
  /** A dismissed question is not a failed tool. */
  questionCancelled?: boolean;
  /** Replaces the tool chip with the answered badge. */
  answeredQuestion?: {
    label: "[ANSWERED]" | "[CANCELLED]";
    entries: SettledQuestionEntry[];
  };
  /** The question form is the UI; the tool name chip stays hidden. */
  pendingQuestion?: boolean;
}

export type ToolCallIconResolver = (
  toolName: string,
  detail: ToolCallDetail | undefined,
  agentMessage: AgentMessage | undefined,
) => ToolCallPresentationIcon;

function displayStatus(status: ToolCallStatus): ToolCallDisplayInput["status"] {
  return status === "executing" ? "running" : status;
}

function displayDetail(detail: ToolCallDetail | undefined): ToolCallDetail {
  return detail ?? { type: "unknown", input: null, output: null };
}

export function buildToolCallPresentation(
  input: BuildToolCallPresentationInput,
): ToolCallPresentation {
  const sourceDetail = input.agentMessage
    ? buildAgentMessageDisplay(input.agentMessage).detail
    : input.detail;
  const pendingQuestion =
    !input.agentMessage &&
    (input.status === "running" || input.status === "executing") &&
    isAskUserQuestionToolName(input.toolName);
  const settledQuestion = input.agentMessage
    ? undefined
    : projectSettledAskUserQuestion({
        name: input.toolName,
        status: displayStatus(input.status),
        detail: displayDetail(sourceDetail),
        metadata: input.metadata,
      });
  const detail = settledQuestion?.detail ?? sourceDetail;
  const displayModel = buildToolCallDisplayModel({
    name: input.toolName,
    agentMessage: input.agentMessage,
    status: displayStatus(input.status),
    error: input.error ?? null,
    detail: displayDetail(sourceDetail),
    metadata: input.metadata,
    cwd: input.cwd,
    targetAgentTitle: input.targetAgentTitle,
  });
  const isLoadingDetails = settledQuestion
    ? false
    : isPendingToolCallDetail({
        detail,
        status: input.status,
        error: input.error,
      });
  const hasDetails = settledQuestion
    ? hasMeaningfulToolCallDetail(settledQuestion.detail)
    : Boolean(input.error) || hasMeaningfulToolCallDetail(detail);

  return {
    detail,
    displayName: displayModel.displayName,
    summary: displayModel.summary,
    errorText: displayModel.errorText,
    diffStat: buildToolCallEditDiffStat(detail),
    icon: input.resolveIcon(input.toolName, detail, input.agentMessage),
    isLoadingDetails,
    hasDetails,
    canOpenDetails: hasDetails || isLoadingDetails,
    openFilePath: extractToolCallFilePath(detail),
    isPlan: input.detail?.type === "plan",
    planOutcome: input.detail?.type === "plan" ? resolvePlanOutcome(input) : undefined,
    ...(settledQuestion?.cancelled ? { questionCancelled: true } : {}),
    ...(settledQuestion
      ? {
          answeredQuestion: {
            label: settledQuestion.displayName,
            entries: settledQuestion.entries,
          },
        }
      : {}),
    ...(pendingQuestion ? { pendingQuestion: true } : {}),
  };
}

function resolvePlanOutcome(input: BuildToolCallPresentationInput): PlanOutcome | undefined {
  if (input.status === "canceled") return "canceled";
  if (input.metadata?.approved === false) return "rejected";
  if (input.metadata?.approved === true) return "approved";
  if (input.status === "running" || input.status === "executing") return "pending";
  return undefined;
}
