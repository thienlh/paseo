import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { AgentAttachment } from "@getpaseo/protocol/messages";
import type { FormPreferences } from "@/create-agent-preferences/preferences";
import type { UserComposerAttachment } from "@/attachments/types";
import { splitComposerAttachmentsForSubmit } from "@/composer/attachments/submit";
import { buildDraftStoreKey, generateDraftId } from "@/stores/draft-keys";
import { useCreateFlowStore } from "@/stores/create-flow-store";
import { useDraftStore } from "@/stores/draft-store";
import { useWorkspaceDraftSubmissionStore } from "@/stores/workspace-draft-submission-store";
import type { WorkspaceDraftTabSetup, WorkspaceTabTarget } from "@/workspace-tabs/model";
import {
  buildPullRequestReviewContext,
  buildPullRequestReviewPrompt,
  pullRequestReviewContextFileName,
  type PullRequestReviewSubject,
} from "./context";

export interface StartedPullRequestReview {
  draftId: string;
  target: WorkspaceTabTarget;
  submitted: boolean;
}

type ReviewClient = Pick<DaemonClient, "getCheckoutDiff" | "uploadFile">;
type ReviewFileAttachment = Extract<UserComposerAttachment, { kind: "file" }>;

export async function startPullRequestReviewChat(input: {
  client: ReviewClient;
  serverId: string;
  workspaceId: string;
  cwd: string;
  pullRequest: PullRequestReviewSubject;
  preferences: FormPreferences;
  draftId?: string;
  now?: number;
}): Promise<StartedPullRequestReview> {
  const diff = await loadBaseDiff(input.client, input.cwd, input.pullRequest.baseRef);
  const fileName = pullRequestReviewContextFileName(input.pullRequest.number);
  const context = buildPullRequestReviewContext({
    pullRequest: input.pullRequest,
    files: diff.files,
    diffTooLarge: diff.diffTooLarge === true,
  });
  const prompt = buildPullRequestReviewPrompt({
    fileName,
    pullRequest: input.pullRequest,
  });
  const file = await uploadContextFile(input.client, fileName, context.markdown);
  const draftId = input.draftId ?? generateDraftId();
  const attachment = { kind: "file" as const, attachment: file };
  const providerId = input.preferences.provider?.trim() ?? "";
  if (!providerId) {
    return saveReviewDraft({
      serverId: input.serverId,
      draftId,
      prompt,
      attachment,
    });
  }

  return queueReviewSubmission({
    serverId: input.serverId,
    workspaceId: input.workspaceId,
    cwd: input.cwd,
    draftId,
    prompt,
    attachment,
    providerId,
    preferences: input.preferences,
    now: input.now,
  });
}

async function loadBaseDiff(client: ReviewClient, cwd: string, baseRef: string) {
  const trimmedBaseRef = baseRef.trim();
  const diff = await client.getCheckoutDiff(cwd, {
    mode: "base",
    ...(trimmedBaseRef ? { baseRef: trimmedBaseRef } : {}),
  });
  if (diff.error) {
    throw new Error(diff.error.message);
  }
  return diff;
}

async function uploadContextFile(client: ReviewClient, fileName: string, markdown: string) {
  const upload = await client.uploadFile({
    fileName,
    mimeType: "text/markdown",
    bytes: new TextEncoder().encode(markdown),
  });
  if (upload.error || !upload.file) {
    throw new Error(upload.error ?? "Upload failed.");
  }
  return upload.file;
}

function saveReviewDraft(input: {
  serverId: string;
  draftId: string;
  prompt: string;
  attachment: ReviewFileAttachment;
}): StartedPullRequestReview {
  useDraftStore.getState().saveDraftInput({
    draftKey: buildDraftStoreKey({
      serverId: input.serverId,
      agentId: input.draftId,
      draftId: input.draftId,
    }),
    draft: { text: input.prompt, attachments: [input.attachment] },
  });
  return {
    draftId: input.draftId,
    target: { kind: "draft", draftId: input.draftId },
    submitted: false,
  };
}

function queueReviewSubmission(input: {
  serverId: string;
  workspaceId: string;
  cwd: string;
  draftId: string;
  prompt: string;
  attachment: ReviewFileAttachment;
  providerId: string;
  preferences: FormPreferences;
  now?: number;
}): StartedPullRequestReview {
  const setup = reviewSetup(input);
  const clientMessageId = `${input.draftId}:initial-message`;
  const timestamp = input.now ?? Date.now();
  const wire = splitComposerAttachmentsForSubmit([input.attachment]);
  const started = useCreateFlowStore.getState().trySetPending({
    serverId: input.serverId,
    workspaceId: input.workspaceId,
    draftId: input.draftId,
    agentId: null,
    clientMessageId,
    text: input.prompt,
    timestamp,
    ...wireAttachments(wire.attachments),
  });
  if (!started) {
    throw new Error("A review chat for this pull request is already starting.");
  }
  useWorkspaceDraftSubmissionStore.getState().setPending({
    serverId: input.serverId,
    workspaceId: input.workspaceId,
    draftId: input.draftId,
    text: input.prompt,
    attachments: [input.attachment],
    cwd: input.cwd,
    provider: input.providerId,
    clientMessageId,
    timestamp,
    ...definedReviewOptions(setup),
    featureValues: setup.featureValues,
  });
  return {
    draftId: input.draftId,
    target: { kind: "draft", draftId: input.draftId, setup },
    submitted: true,
  };
}

function reviewSetup(input: {
  providerId: string;
  cwd: string;
  preferences: FormPreferences;
}): WorkspaceDraftTabSetup {
  const providerPreferences = input.preferences.providerPreferences?.[input.providerId];
  const model = providerPreferences?.model ?? null;
  return {
    provider: input.providerId,
    cwd: input.cwd,
    modeId: providerPreferences?.mode ?? null,
    model,
    thinkingOptionId: thinkingOptionId(providerPreferences?.thinkingByModel, model),
    featureValues: providerPreferences?.featureValues ?? {},
  };
}

function thinkingOptionId(
  thinkingByModel: Record<string, string> | undefined,
  model: string | null,
): string | null {
  if (!model || !thinkingByModel) {
    return null;
  }
  return thinkingByModel[model] ?? null;
}

function wireAttachments(attachments: AgentAttachment[]): { attachments?: AgentAttachment[] } {
  if (attachments.length === 0) {
    return {};
  }
  return { attachments };
}

function definedReviewOptions(setup: WorkspaceDraftTabSetup): {
  modeId?: string;
  model?: string;
  thinkingOptionId?: string;
} {
  return {
    ...(setup.modeId ? { modeId: setup.modeId } : {}),
    ...(setup.model ? { model: setup.model } : {}),
    ...(setup.thinkingOptionId ? { thinkingOptionId: setup.thinkingOptionId } : {}),
  };
}
