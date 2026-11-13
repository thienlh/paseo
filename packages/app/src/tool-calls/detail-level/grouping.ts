import { isTurnTrigger, isTurnBoundary } from "@/agent-stream/turn-membership";
import type { ToolCallDetail } from "@getpaseo/protocol/agent-types";
import { splitProviderMessage } from "@/components/provider-image";
import { isPaseoToolName, parseMcpToolName } from "@getpaseo/protocol/tool-name-normalization";
import type { StreamItem, ToolCallItem, ThoughtItem } from "@/types/stream";

export interface ToolCallDescriptor {
  detail: ToolCallDetail;
  name: string;
  status: "executing" | "running" | "completed" | "failed" | "canceled";
  error: unknown;
  metadata?: Record<string, unknown>;
}

export type GroupableItem = ToolCallItem | ThoughtItem;

export interface ToolCallRun {
  id: string;
  calls: readonly GroupableItem[];
  latest: GroupableItem;
  isSealed: boolean;
}

export interface GroupedHistory<TGroup> {
  tail: StreamItem[];
  groupsByHostId: Map<string, TGroup>;
  pendingCalls: readonly GroupableItem[];
  pendingProviderImages: readonly StreamItem[];
}

export interface GroupedToolCalls<TGroup> {
  tail: StreamItem[];
  head: StreamItem[];
  groupsByHostId: ToolCallGroupLookup<TGroup>;
  historyGroupUpdatesByHostId: ToolCallGroupLookup<TGroup>;
}

export interface ToolCallGroupLookup<TGroup> {
  readonly size: number;
  get(id: string): TGroup | undefined;
  has(id: string): boolean;
}

const EMPTY_GROUPS = new Map<string, never>();

export function describeToolCall(item: ToolCallItem): ToolCallDescriptor {
  if (item.payload.source === "agent") {
    const { data } = item.payload;
    return {
      detail: data.detail,
      name: data.name,
      status: data.status,
      error: data.error,
      metadata: data.metadata,
    };
  }

  const { data } = item.payload;
  return {
    detail: {
      type: "unknown",
      input: data.arguments ?? null,
      output: data.result ?? null,
    },
    name: data.toolName,
    status: data.status,
    error: data.error,
  };
}

export function isGroupableToolCall(
  item: StreamItem,
  autoExpandReasoning = false,
): item is GroupableItem {
  if (item.kind === "thought") return !autoExpandReasoning;
  if (item.kind !== "tool_call" || isTurnTrigger(item)) {
    return false;
  }
  const descriptor = describeToolCall(item);
  return descriptor.detail.type !== "plan" && descriptor.name.trim().toLowerCase() !== "speak";
}

export function getMcpServerForCall(call: StreamItem): string | null {
  if (call.kind !== "tool_call") return null;
  const name = describeToolCall(call).name;
  if (isPaseoToolName(name)) return null;
  return parseMcpToolName(name)?.server ?? null;
}

function hasCompatibleMcpServer(pending: readonly GroupableItem[], item: StreamItem): boolean {
  const previous = pending.at(-1);
  if (!previous) return true;
  return getMcpServerForCall(previous) === getMcpServerForCall(item);
}

function shouldDeferProviderImage(pending: readonly GroupableItem[], item: StreamItem): boolean {
  if (pending.length === 0 || item.kind !== "assistant_message") return false;
  const previous = pending.at(-1);
  if (previous === undefined || getMcpServerForCall(previous) === null) return false;
  return splitProviderMessage(item.text).some((segment) => segment.kind === "image");
}

function createRun(calls: readonly GroupableItem[], isSealed: boolean): ToolCallRun {
  const first = calls[0];
  const latest = calls.at(-1);
  if (!first || !latest) {
    throw new Error("Cannot group an empty tool call run");
  }
  return { id: first.id, calls, latest, isSealed };
}

function createHost(run: ToolCallRun): GroupableItem {
  if (run.calls.length === 1) {
    return run.latest;
  }
  return { ...run.latest, id: run.id };
}

function isRunning(call: GroupableItem): boolean {
  if (call.kind === "thought") return call.status !== "ready";
  const status = describeToolCall(call).status;
  return status === "running" || status === "executing";
}

function appendRun<TGroup>(input: {
  calls: readonly GroupableItem[];
  isSealed: boolean;
  output: StreamItem[];
  groups: Map<string, TGroup>;
  buildGroup: (run: ToolCallRun) => TGroup;
}): void {
  if (input.calls.length === 0) {
    return;
  }
  const run = createRun(input.calls, input.isSealed);
  const host = createHost(run);
  input.output.push(host);
  if (run.calls.length > 1) input.groups.set(host.id, input.buildGroup(run));
}

export function prepareGroupedHistory<TGroup>(input: {
  tail: StreamItem[];
  buildGroup: (run: ToolCallRun) => TGroup;
  autoExpandReasoning?: boolean;
}): GroupedHistory<TGroup> {
  const output: StreamItem[] = [];
  const groups = new Map<string, TGroup>();
  let pending: GroupableItem[] = [];
  let deferredProviderImages: StreamItem[] = [];

  const flush = () => {
    appendRun({
      calls: pending,
      isSealed: true,
      output,
      groups,
      buildGroup: input.buildGroup,
    });
    output.push(...deferredProviderImages);
    pending = [];
    deferredProviderImages = [];
  };

  for (const item of input.tail) {
    if (shouldDeferProviderImage(pending, item)) {
      deferredProviderImages.push(item);
      continue;
    }
    if (
      isGroupableToolCall(item, input.autoExpandReasoning) &&
      !isTurnBoundary(pending.at(-1) ?? null, item) &&
      hasCompatibleMcpServer(pending, item)
    ) {
      pending.push(item);
      continue;
    }
    flush();
    if (isGroupableToolCall(item, input.autoExpandReasoning)) pending.push(item);
    else output.push(item);
  }

  appendRun({
    calls: pending,
    isSealed: true,
    output,
    groups,
    buildGroup: input.buildGroup,
  });
  output.push(...deferredProviderImages);

  return {
    tail: groups.size > 0 ? output : input.tail,
    groupsByHostId: groups,
    pendingCalls: pending,
    pendingProviderImages: deferredProviderImages,
  };
}

export function groupLiveToolCalls<TGroup>(input: {
  history: GroupedHistory<TGroup>;
  head: StreamItem[];
  isTurnActive: boolean;
  buildGroup: (run: ToolCallRun) => TGroup;
  autoExpandReasoning?: boolean;
}): GroupedToolCalls<TGroup> {
  const head: StreamItem[] = [];
  const liveGroups = new Map<string, TGroup>();
  let pending = [...input.history.pendingCalls];
  let hostPlacement: "history" | "head" | null = pending.length > 0 ? "history" : null;
  let pendingIncludesHead = false;
  let deferredProviderImages = [...input.history.pendingProviderImages];

  const flush = (isSealed: boolean) => {
    if (pending.length === 0) {
      head.push(...deferredProviderImages);
      deferredProviderImages = [];
      return;
    }
    const run = createRun(pending, isSealed);
    if (hostPlacement === "head") {
      head.push(createHost(run));
    }
    const needsLiveGroup = hostPlacement === "head" || pendingIncludesHead || !isSealed;
    if (run.calls.length > 1 && needsLiveGroup) {
      liveGroups.set(run.id, input.buildGroup(run));
    }
    head.push(...deferredProviderImages);
    deferredProviderImages = [];
    pending = [];
    hostPlacement = null;
    pendingIncludesHead = false;
  };

  for (const item of input.head) {
    if (shouldDeferProviderImage(pending, item)) {
      deferredProviderImages.push(item);
      pendingIncludesHead = true;
      continue;
    }
    if (isTurnBoundary(pending.at(-1) ?? null, item) || !hasCompatibleMcpServer(pending, item)) {
      flush(true);
    }
    if (isGroupableToolCall(item, input.autoExpandReasoning)) {
      if (pending.length === 0) {
        hostPlacement = "head";
      }
      pending.push(item);
      pendingIncludesHead = true;
      continue;
    }
    flush(true);
    head.push(item);
  }
  // Tool calls live in retained tail rather than the streaming head. The agent
  // lifecycle snapshot can still be idle while a newly received tool call is
  // already running, so its direct timeline status is the authoritative start
  // signal. The lifecycle state continues to keep completed calls live between
  // sequential tool updates.
  const trailingRunIsActive = input.isTurnActive || pending.some(isRunning);
  flush(!trailingRunIsActive);

  if (liveGroups.size === 0) {
    return {
      tail: input.history.tail,
      head: input.head,
      groupsByHostId: input.history.groupsByHostId,
      historyGroupUpdatesByHostId: EMPTY_GROUPS,
    };
  }
  const groupsByHostId = new Map(input.history.groupsByHostId);
  let historyGroupUpdatesByHostId: Map<string, TGroup> | null = null;
  for (const [id, group] of liveGroups) {
    groupsByHostId.set(id, group);
    const isHistoryHost =
      input.history.groupsByHostId.has(id) || input.history.pendingCalls[0]?.id === id;
    if (isHistoryHost) {
      historyGroupUpdatesByHostId ??= new Map();
      historyGroupUpdatesByHostId.set(id, group);
    }
  }
  return {
    tail: input.history.tail,
    head,
    groupsByHostId,
    historyGroupUpdatesByHostId: historyGroupUpdatesByHostId ?? EMPTY_GROUPS,
  };
}
