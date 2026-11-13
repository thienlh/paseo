/** @vitest-environment jsdom */
import React, { type ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { useSessionStore, type Agent, type WorkspaceDescriptor } from "@/stores/session-store";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { buildWorkspaceTabPersistenceKey } from "@/workspace-tabs/model";
import { ToastApiProvider } from "@/contexts/toast-api-context";
import { useGitChatCommand } from "./use-chat-command";

const errors: string[] = [];
const toast = {
  show: (message: ReactNode, options?: { variant?: string }) => {
    if (options?.variant === "error") errors.push(String(message));
    return () => {};
  },
  copied: () => {},
  error: (message: string) => {
    errors.push(message);
  },
};
function wrapper({ children }: { children: ReactNode }) {
  return <ToastApiProvider api={toast}>{children}</ToastApiProvider>;
}
const workspace: WorkspaceDescriptor = {
  id: "workspace",
  projectId: "project",
  projectDisplayName: "Project",
  projectCustomName: null,
  projectRootPath: "/repo",
  workspaceDirectory: "/repo",
  projectKind: "git",
  workspaceKind: "worktree",
  name: "feature",
  status: "done",
  statusEnteredAt: null,
  archivingAt: null,
  diffStat: null,
  scripts: [],
  createdAt: null,
  lastUserMessageAt: null,
};
const agent: Agent = {
  serverId: "server",
  id: "current",
  provider: "codex",
  status: "idle",
  turn: { phase: "idle", cancellationRequestId: null },
  createdAt: new Date(0),
  updatedAt: new Date(0),
  lastUserMessageAt: null,
  lastActivityAt: new Date(0),
  capabilities: {
    supportsStreaming: true,
    supportsSessionPersistence: true,
    supportsDynamicModes: false,
    supportsMcpServers: false,
    supportsReasoningStream: false,
    supportsToolInvocations: false,
  },
  currentModeId: null,
  availableModes: [],
  pendingPermissions: [],
  persistence: null,
  title: null,
  cwd: "/repo",
  workspaceId: "workspace",
  model: "current-model",
  parentAgentId: null,
  labels: {},
};
const context = {
  serverId: "server",
  workspaceId: "workspace",
  cwd: "/repo",
  branch: "feature",
  baseRef: "origin/main",
  pullRequestUrl: null,
  headSha: "published",
};
const key = buildWorkspaceTabPersistenceKey({ serverId: "server", workspaceId: "workspace" })!;
const sent: string[] = [];
let fail = false;
beforeEach(() => {
  vi.stubGlobal("React", React);
  errors.length = 0;
  sent.length = 0;
  fail = false;
  useSessionStore.setState({ sessions: {} });
  // The transport is the only test boundary; layout, queue and message submission are real.
  const client = {
    isConnected: true,
    sendAgentMessage: async (id: string, text: string) => {
      expect(id).toBe("current");
      if (fail) throw new Error("Host disconnected");
      sent.push(text);
    },
  } as unknown as DaemonClient;
  const store = useSessionStore.getState();
  store.initializeSession("server", client);
  store.setWorkspaces("server", new Map([[workspace.id, workspace]]));
  store.setAgents("server", new Map([[agent.id, agent]]));
  useWorkspaceLayoutStore.setState({ layoutByWorkspace: {} });
  useWorkspaceLayoutStore.getState().openTab({
    workspaceKey: key,
    target: { kind: "agent", agentId: "current" },
    intent: "reveal",
  });
});
afterEach(() => vi.unstubAllGlobals());
function setup() {
  return renderHook(() => useGitChatCommand(context), { wrapper });
}

describe("Git commands in the current chat", () => {
  it("sends Create PR as a visible user message without changing model or agent", async () => {
    const { result } = setup();
    await act(async () => result.current.send("pr"));
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("Create a pull request");
    expect(sent[0]).toContain("commit and push as needed");
    const session = useSessionStore.getState().sessions.server;
    expect(session.agentStreamTail.get("current")?.at(-1)).toMatchObject({
      kind: "user_message",
      text: sent[0],
    });
    expect(session.agents.get("current")?.model).toBe("current-model");
    expect([...session.agents.keys()]).toEqual(["current"]);
    expect(errors).toEqual([]);
  });
  it("queues behind a busy chat without sending or interrupting", async () => {
    useSessionStore.getState().setInitializingAgents("server", new Map([["current", true]]));
    const { result } = setup();
    await act(async () => result.current.send("commit"));
    expect(sent).toEqual([]);
    const queued = useSessionStore.getState().sessions.server.queuedMessages.get("current");
    expect(queued).toHaveLength(1);
    expect(queued?.[0].text).toContain("commit and push all changes");
  });
  it("reports a failed send and permits a retry without a false Git success", async () => {
    const { result } = setup();
    fail = true;
    await act(async () => result.current.send("commit"));
    expect(errors).toEqual(["Host disconnected"]);
    expect(result.current.pending).toBe(false);
    expect(useSessionStore.getState().sessions.server.agentStreamTail.get("current")).toEqual([]);
    fail = false;
    await act(async () => result.current.send("commit"));
    expect(sent).toHaveLength(1);
  });
  it("asks for a chat when selection is ambiguous instead of creating an agent", async () => {
    useWorkspaceLayoutStore.getState().openTab({
      workspaceKey: key,
      target: { kind: "agent", agentId: "another" },
      intent: "reveal",
    });
    useWorkspaceLayoutStore
      .getState()
      .openTab({ workspaceKey: key, target: { kind: "files" }, intent: "reveal" });
    const { result } = setup();
    await act(async () => result.current.send("pr"));
    expect(sent).toEqual([]);
    expect(errors).toEqual(["Select a chat in this workspace, then try again."]);
  });
  it("uses the selected workspace when two records share a checkout", async () => {
    const other = { ...workspace, id: "other" };
    useSessionStore.getState().setWorkspaces(
      "server",
      new Map([
        [other.id, other],
        [workspace.id, workspace],
      ]),
    );
    const { result } = setup();
    await act(async () => result.current.send("commit"));
    expect(sent).toHaveLength(1);
    expect(errors).toEqual([]);
  });
  it("keeps merge safeguards in the visible instruction", async () => {
    const { result } = setup();
    await act(async () => result.current.send("merge-pr"));
    expect(sent[0]).toContain("Choose the merge method");
    expect(sent[0]).toContain("instructions, conventions and allowed methods");
    expect(sent[0]).toContain("expected-head guard");
    expect(sent[0]).toContain("Observed checkout revision: published");
    expect(sent[0]).toContain("do not bypass protections");
  });
});
