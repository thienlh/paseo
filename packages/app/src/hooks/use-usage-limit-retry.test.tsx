/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { AgentScreenAgent } from "@/hooks/use-agent-screen-state-machine";
import type { ToastApi } from "@/components/toast-host";
import { navigateToWorkspace } from "@/stores/navigation-active-workspace-store";
import { useSessionStore } from "@/stores/session-store";
import type { UserMessageItem } from "@/types/stream";
import { useUsageLimitRetry } from "./use-usage-limit-retry";

vi.mock("@/stores/navigation-active-workspace-store", () => ({
  navigateToWorkspace: vi.fn(),
}));

const agent: AgentScreenAgent = {
  serverId: "server-a",
  id: "agent-1",
  provider: "claude",
  status: "error",
  cwd: "/repo",
  workspaceId: "workspace-1",
  currentModeId: "auto",
  model: "claude-opus-5-5",
  thinkingOptionId: "high",
  options: { fast_mode: true },
};

const attachment: NonNullable<UserMessageItem["attachments"]>[number] = {
  type: "uploaded_file",
  id: "file-1",
  fileName: "notes.txt",
  mimeType: "text/plain",
  size: 5,
  path: "/tmp/notes.txt",
};
const message: UserMessageItem = {
  kind: "user_message",
  id: "message-1",
  text: "Original prompt",
  timestamp: new Date("2026-11-11T09:00:00.000Z"),
  attachments: [attachment],
};

function clientWith(overrides: Partial<DaemonClient>): DaemonClient {
  return overrides as DaemonClient;
}

beforeEach(() => {
  vi.clearAllMocks();
  useSessionStore.setState((state) => ({ ...state, sessions: {} }));
});

describe("useUsageLimitRetry", () => {
  it("resends the original prompt and attachments in the current chat", async () => {
    const sendAgentMessage = vi.fn().mockResolvedValue(undefined);
    useSessionStore.getState().initializeSession("server-a", clientWith({ sendAgentMessage }));
    const { result } = renderHook(() =>
      useUsageLimitRetry({ serverId: "server-a", agentId: "agent-1", agent }),
    );

    await act(async () => result.current.retry(message));

    expect(sendAgentMessage).toHaveBeenCalledWith("agent-1", "Original prompt", {
      messageId: expect.any(String),
      images: [],
      attachments: [attachment],
    });
    expect(result.current.pendingAction).toBeNull();
  });

  it("creates a clean agent with the original request and opens it", async () => {
    const createAgent = vi.fn().mockResolvedValue({ id: "new-agent" });
    useSessionStore.getState().initializeSession("server-a", clientWith({ createAgent }));
    const { result } = renderHook(() =>
      useUsageLimitRetry({ serverId: "server-a", agentId: "agent-1", agent }),
    );

    await act(async () => result.current.retryInNewChat(message));

    expect(createAgent).toHaveBeenCalledWith({
      idempotencyKey: expect.any(String),
      config: {
        provider: "claude",
        cwd: "/repo",
        modeId: "auto",
        model: "claude-opus-5-5",
        thinkingOptionId: "high",
        providerOptions: { fast_mode: true },
      },
      workspaceId: "workspace-1",
      clientMessageId: expect.any(String),
      initialPrompt: "Original prompt",
      images: [],
      attachments: [attachment],
    });
    expect(navigateToWorkspace).toHaveBeenCalledWith({
      serverId: "server-a",
      workspaceId: "workspace-1",
      target: { kind: "agent", agentId: "new-agent" },
    });
  });

  it("reports a failed current-chat retry and becomes actionable again", async () => {
    const sendAgentMessage = vi.fn().mockRejectedValue(new Error("Host offline"));
    useSessionStore.getState().initializeSession("server-a", clientWith({ sendAgentMessage }));
    const toast = { error: vi.fn() } as unknown as ToastApi;
    const { result } = renderHook(() =>
      useUsageLimitRetry({ serverId: "server-a", agentId: "agent-1", agent, toast }),
    );

    await act(async () => result.current.retry(message));

    expect(toast.error).toHaveBeenCalledWith("Host offline");
    expect(result.current.pendingAction).toBeNull();
  });

  it("reports a failed new-chat retry without opening a tab", async () => {
    const createAgent = vi.fn().mockRejectedValue(new Error("Creation failed"));
    useSessionStore.getState().initializeSession("server-a", clientWith({ createAgent }));
    const toast = { error: vi.fn() } as unknown as ToastApi;
    const { result } = renderHook(() =>
      useUsageLimitRetry({ serverId: "server-a", agentId: "agent-1", agent, toast }),
    );

    await act(async () => result.current.retryInNewChat(message));

    expect(toast.error).toHaveBeenCalledWith("Creation failed");
    expect(result.current.pendingAction).toBeNull();
    expect(navigateToWorkspace).not.toHaveBeenCalled();
  });
});
