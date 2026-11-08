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
  LOCAL_CHANGES_REVIEW_CONTEXT_FILE_NAME,
  buildLocalChangesReviewContext,
  buildLocalChangesReviewPrompt,
  buildPullRequestReviewContext,
  buildPullRequestReviewPrompt,
  pullRequestReviewContextFileName,
  type ReviewSubject,
} from "./context";
import { REVIEW_FINDINGS_DIR, reviewFindingsFileName } from "./findings";

export interface StartedPullRequestReview {
  draftId: string;
  target: WorkspaceTabTarget;
  submitted: boolean;
}

type ReviewClient = Pick<DaemonClient, "getCheckoutDiff" | "uploadFile">;
type ReviewFileAttachment = Extract<UserComposerAttachment, { kind: "file" }>;

export async function startReviewChat(input: {
  client: ReviewClient;
  serverId: string;
  workspaceId: string;
  cwd: string;
  subject: ReviewSubject;
  preferences: FormPreferences;
  draftId?: string;
  now?: number;
}): Promise<StartedPullRequestReview> {
  const findingsPath = reviewFindingsPath({
    cwd: input.cwd,
    subject: input.subject,
    startedAt: new Date(input.now ?? Date.now()),
    provider: input.preferences.provider?.trim() || null,
  });
  const { fileName, markdown, prompt } = await buildReviewRequest(
    input.client,
    input.cwd,
    input.subject,
    findingsPath,
  );
  const file = await uploadContextFile(input.client, fileName, markdown);
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

/** Where the review saves its findings, for the Checks panel to read. */
export function reviewFindingsPath(input: {
  cwd: string;
  subject: ReviewSubject;
  startedAt: Date;
  provider?: string | null;
}): string {
  const fileName = reviewFindingsFileName({
    startedAt: input.startedAt,
    provider: input.provider,
    subject:
      input.subject.kind === "pull_request" ? `pr-${input.subject.pullRequest.number}` : "local",
  });
  return `${input.cwd.replace(/\/+$/, "")}/${REVIEW_FINDINGS_DIR}/${fileName}`;
}

async function buildReviewRequest(
  client: ReviewClient,
  cwd: string,
  subject: ReviewSubject,
  findingsPath: string,
): Promise<{ fileName: string; markdown: string; prompt: string }> {
  if (subject.kind === "pull_request") {
    const { pullRequest } = subject;
    const diff = await loadPullRequestDiff(client, cwd, pullRequest.baseRef);
    const fileName = pullRequestReviewContextFileName(pullRequest.number);
    const context = diff
      ? buildPullRequestReviewContext({
          pullRequest,
          files: diff.files,
          diffTooLarge: diff.diffTooLarge === true,
        })
      : buildPullRequestReviewContext({ pullRequest, files: [], baseMismatch: true });
    return {
      fileName,
      markdown: context.markdown,
      prompt: buildPullRequestReviewPrompt({ fileName, findingsPath, pullRequest }),
    };
  }

  const { changes } = subject;
  // "all" is the branch's commits since its base plus the working tree, untracked files included.
  const diff = changes.baseRef
    ? await loadDiff(client, cwd, "all", changes.baseRef)
    : await loadDiff(client, cwd, "uncommitted", null);
  const fileName = LOCAL_CHANGES_REVIEW_CONTEXT_FILE_NAME;
  const context = buildLocalChangesReviewContext({
    changes,
    files: diff.files,
    diffTooLarge: diff.diffTooLarge === true,
  });
  return {
    fileName,
    markdown: context.markdown,
    prompt: buildLocalChangesReviewPrompt({ fileName, findingsPath, changes }),
  };
}

/**
 * A worktree diffs against the base it was created from, and the host refuses another one. A pull
 * request can target a different branch (retargeted or stacked), so that diff comes back null and
 * the review reads it with git instead.
 */
async function loadPullRequestDiff(client: ReviewClient, cwd: string, baseRef: string) {
  try {
    return await loadDiff(client, cwd, "base", baseRef);
  } catch (error) {
    // The host reports this without an error code; see baseRefMismatchError in checkout-git.ts.
    if (error instanceof Error && error.message.includes("Base ref mismatch")) {
      return null;
    }
    throw error;
  }
}

async function loadDiff(
  client: ReviewClient,
  cwd: string,
  mode: "base" | "all" | "uncommitted",
  baseRef: string | null,
) {
  const trimmedBaseRef = baseRef?.trim();
  const diff = await client.getCheckoutDiff(cwd, {
    mode,
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
    throw new Error("A review chat is already starting.");
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
