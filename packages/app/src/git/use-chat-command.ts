import { useCallback, useRef } from "react";
import { create } from "zustand";
import { useSessionStore, selectAgentTurnPresentation } from "@/stores/session-store";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { buildWorkspaceTabPersistenceKey } from "@/workspace-tabs/model";
import { dispatchComposerAgentMessage, queueComposerMessage } from "@/composer/actions";
import { createMessageSubmissionWriter } from "@/composer/submission/writer";
import { useToast } from "@/contexts/toast-context";
import { i18n } from "@/i18n/i18next";
import { buildGitChatCommand, currentGitChat, type GitChatAction } from "./chat-command";

// Shared by header and Changes pane: a double click must never submit twice.
const useGitChatSubmission = create<{ pending: Set<string> }>(() => ({ pending: new Set() }));

function resolveChatRecipient(serverId: string, cwd: string, workspaceId?: string) {
  const store = useSessionStore.getState();
  const session = store.sessions[serverId];
  const client = session?.client;
  if (!client?.isConnected) throw new Error(i18n.t("workspace.terminal.hostDisconnected"));
  const matches = [...session.workspaces.values()].filter(
    (entry) =>
      entry.workspaceDirectory === cwd && (workspaceId === undefined || entry.id === workspaceId),
  );
  const workspace = matches.length === 1 ? matches[0] : undefined;
  const workspaceKey = workspace
    ? buildWorkspaceTabPersistenceKey({ serverId: serverId, workspaceId: workspace.id })
    : null;
  const layouts = useWorkspaceLayoutStore.getState();
  const agentId = currentGitChat(
    workspaceKey ? layouts.layoutByWorkspace[workspaceKey] : undefined,
  );
  if (!agentId || !workspaceKey) throw new Error(i18n.t("workspace.git.actions.chat.selectChat"));
  const agent = session.agents.get(agentId);
  if (!agent || agent.cwd !== cwd || agent.archivedAt)
    throw new Error(i18n.t("workspace.git.actions.chat.selectChat"));
  return { store, session, client, workspaceKey, agentId };
}

export function useGitChatCommand(input: {
  serverId: string;
  workspaceId?: string;
  cwd: string;
  branch: string | null;
  baseRef: string | null;
  pullRequestUrl: string | null;
  headSha: string | null;
}) {
  const { serverId, workspaceId, cwd, branch, baseRef, pullRequestUrl, headSha } = input;
  const toast = useToast();
  const dismissFailure = useRef<(() => void) | null>(null);
  const key = `${serverId}:${cwd}`;
  const pending = useGitChatSubmission((state) => state.pending.has(key));
  const send = useCallback(
    async (action: GitChatAction) => {
      if (useGitChatSubmission.getState().pending.has(key)) return;
      dismissFailure.current?.();
      useGitChatSubmission.setState((state) => ({ pending: new Set(state.pending).add(key) }));
      try {
        const { store, session, client, workspaceKey, agentId } = resolveChatRecipient(
          serverId,
          cwd,
          workspaceId,
        );
        const text = buildGitChatCommand({ cwd, branch, baseRef, pullRequestUrl, headSha, action });
        useWorkspaceLayoutStore
          .getState()
          .openTab({ workspaceKey, target: { kind: "agent", agentId }, intent: "reveal" });
        const busy =
          selectAgentTurnPresentation(session, agentId).isActive ||
          session.initializingAgents.get(agentId) === true;
        if (busy || (session.queuedMessages.get(agentId)?.length ?? 0) > 0) {
          if (session.queuedMessages.get(agentId)?.some((message) => message.text === text)) return;
          queueComposerMessage({
            agentId,
            text,
            attachments: [],
            queue: {
              read: (id) =>
                useSessionStore.getState().sessions[serverId]?.queuedMessages.get(id) ?? [],
              write: (update) => store.setQueuedMessages(serverId, update),
            },
          });
          toast.show(i18n.t("workspace.git.actions.chat.queued"));
        } else {
          await dispatchComposerAgentMessage({
            client,
            agentId,
            text,
            attachments: [],
            encodeImages: async () => [],
            submission: createMessageSubmissionWriter(serverId),
            activeTurnBehavior: "steer",
          });
        }
      } catch (error) {
        dismissFailure.current = toast.show(
          error instanceof Error ? error.message : i18n.t("composer.errors.failedToSend"),
          { variant: "error", durationMs: null, nativeAndroid: false },
        );
      } finally {
        useGitChatSubmission.setState((state) => {
          const next = new Set(state.pending);
          next.delete(key);
          return { pending: next };
        });
      }
    },
    [serverId, workspaceId, cwd, branch, baseRef, pullRequestUrl, headSha, key, toast],
  );
  return { send, pending };
}
