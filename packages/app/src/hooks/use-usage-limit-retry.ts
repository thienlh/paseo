import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AgentScreenAgent } from "@/hooks/use-agent-screen-state-machine";
import { useStableEvent } from "@/hooks/use-stable-event";
import type { ToastApi } from "@/components/toast-host";
import { createMessageSubmissionWriter } from "@/composer/submission/writer";
import { buildWorkspaceDraftAgentConfig } from "@/screens/workspace/workspace-draft-agent-config";
import { generateDraftId } from "@/stores/draft-keys";
import { navigateToWorkspace } from "@/stores/navigation-active-workspace-store";
import { useSessionStore } from "@/stores/session-store";
import { createUserMessage, generateMessageId, type UserMessageItem } from "@/types/stream";
import { encodeImages } from "@/utils/encode-images";
import { toErrorMessage } from "@/utils/error-messages";

export type UsageLimitRetryAction = "retry" | "new-chat";

export function useUsageLimitRetry(input: {
  serverId: string;
  agentId: string;
  agent: AgentScreenAgent;
  toast?: ToastApi | null;
  readOnly?: boolean;
}) {
  const { serverId, agentId, agent, toast, readOnly = false } = input;
  const { t } = useTranslation();
  const client = useSessionStore((state) => state.sessions[serverId]?.client ?? null);
  const [pendingAction, setPendingAction] = useState<UsageLimitRetryAction | null>(null);

  const run = useStableEvent(
    async (action: UsageLimitRetryAction, failureMessage: string, task: () => Promise<void>) => {
      if (readOnly || pendingAction !== null) return;
      setPendingAction(action);
      try {
        await task();
      } catch (error) {
        toast?.error(toErrorMessage(error) || failureMessage);
      } finally {
        setPendingAction(null);
      }
    },
  );

  const retry = useStableEvent(async (message: UserMessageItem) => {
    await run("retry", t("composer.errors.failedToSend"), async () => {
      if (!client) throw new Error(t("workspace.terminal.hostDisconnected"));
      const clientMessageId = generateMessageId();
      const submission = createMessageSubmissionWriter(serverId);
      submission.begin(
        agentId,
        createUserMessage({
          clientMessageId,
          text: message.text,
          timestamp: new Date(),
          images: message.images,
          attachments: message.attachments,
        }),
      );
      try {
        const images = await encodeImages(message.images);
        await client.sendAgentMessage(agentId, message.text, {
          messageId: clientMessageId,
          images: images ?? [],
          attachments: message.attachments ?? [],
        });
        submission.accept(agentId, clientMessageId);
      } catch (error) {
        submission.reject(agentId, clientMessageId);
        throw error;
      }
    });
  });

  const retryInNewChat = useStableEvent(async (message: UserMessageItem) => {
    await run("new-chat", t("composer.errors.failedToCreateAgent"), async () => {
      if (!client) throw new Error(t("workspace.terminal.hostDisconnected"));
      const workspaceId = agent.workspaceId;
      const provider = agent.provider;
      if (!workspaceId || !provider) throw new Error(t("composer.errors.failedToCreateAgent"));
      const config = buildWorkspaceDraftAgentConfig({
        provider,
        cwd: agent.cwd,
        modeId: agent.currentModeId ?? agent.runtimeInfo?.modeId ?? undefined,
        model: agent.model ?? agent.runtimeInfo?.model ?? undefined,
        thinkingOptionId:
          agent.thinkingOptionId ?? agent.runtimeInfo?.thinkingOptionId ?? undefined,
        providerOptions: { ...agent.options },
      });
      const idempotencyKey = generateDraftId();
      const images = await encodeImages(message.images);
      const created = await client.createAgent({
        idempotencyKey,
        config,
        workspaceId,
        clientMessageId: generateMessageId(),
        ...(message.text ? { initialPrompt: message.text } : {}),
        images: images ?? [],
        attachments: message.attachments ?? [],
      });
      navigateToWorkspace({
        serverId,
        workspaceId,
        target: { kind: "agent", agentId: created.id },
      });
    });
  });

  return { pendingAction, retry, retryInNewChat };
}
