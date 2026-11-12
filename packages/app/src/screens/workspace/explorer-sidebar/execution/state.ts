import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { z } from "zod";
import { createValidatedPersistStorage } from "@/storage/validated-persist-storage";

const executionStateSchema = z.object({
  expanded: z.boolean(),
  view: z.enum(["run", "terminal"]),
  surface: z.enum(["supporting", "execution"]),
  height: z.number().finite().positive(),
  scriptName: z.string().nullable(),
  supportingTabId: z.string().nullable(),
  terminalTabId: z.string().nullable(),
  observedTabId: z.string().nullable(),
});

export type ExplorerExecutionState = z.infer<typeof executionStateSchema>;
export type ExecutionView = ExplorerExecutionState["view"];

export const DEFAULT_EXECUTION_STATE: ExplorerExecutionState = {
  expanded: false,
  view: "run",
  surface: "supporting",
  height: 280,
  scriptName: null,
  supportingTabId: null,
  terminalTabId: null,
  observedTabId: null,
};

export type ExecutionEvent =
  | { type: "observe" | "select"; tabId: string; terminal: boolean; scriptName: string | null }
  | { type: "view"; view: ExecutionView }
  | { type: "script"; name: string }
  | { type: "toggle" }
  | { type: "resize"; height: number };

export function reduceExecutionState(
  state: ExplorerExecutionState,
  event: ExecutionEvent,
): ExplorerExecutionState {
  switch (event.type) {
    case "observe":
    case "select": {
      if (event.type === "observe" && state.observedTabId === event.tabId) return state;
      if (!event.terminal)
        return {
          ...state,
          observedTabId: event.tabId,
          supportingTabId: event.tabId,
          surface: "supporting",
        };
      const discoveredView = event.scriptName ? "run" : "terminal";
      return {
        ...state,
        observedTabId: event.tabId,
        terminalTabId: event.tabId,
        expanded: true,
        surface: "execution",
        view: event.type === "select" ? state.view : discoveredView,
        scriptName: event.scriptName ?? state.scriptName,
      };
    }
    case "view":
      return { ...state, view: event.view, expanded: true, surface: "execution" };
    case "script":
      return {
        ...state,
        scriptName: event.name,
        view: "run",
        expanded: true,
        surface: "execution",
      };
    case "toggle":
      return {
        ...state,
        expanded: !state.expanded,
        surface: state.expanded ? "supporting" : "execution",
      };
    case "resize":
      return { ...state, height: event.height };
  }
}

const persistedSchema = z.object({ byWorkspace: z.record(z.string(), executionStateSchema) });
interface ExecutionStore {
  byWorkspace: Record<string, ExplorerExecutionState>;
  dispatch: (workspaceKey: string, event: ExecutionEvent) => void;
}

export const useExplorerExecutionStore = create<ExecutionStore>()(
  persist<ExecutionStore, [], [], z.infer<typeof persistedSchema>>(
    (set, get) => ({
      byWorkspace: {},
      dispatch: (workspaceKey, event) => {
        const current = get().byWorkspace[workspaceKey] ?? DEFAULT_EXECUTION_STATE;
        const next = reduceExecutionState(current, event);
        if (current === next) return;
        set((store) => ({ byWorkspace: { ...store.byWorkspace, [workspaceKey]: next } }));
      },
    }),
    {
      name: "explorer-execution",
      storage: createValidatedPersistStorage(AsyncStorage, persistedSchema),
      partialize: (store) => ({ byWorkspace: store.byWorkspace }),
      merge: (persisted, current) => {
        const parsed = persistedSchema.safeParse(persisted);
        return { ...current, byWorkspace: parsed.success ? parsed.data.byWorkspace : {} };
      },
    },
  ),
);

export function resolveExecutionHeight(input: { requested: number; available: number }): number {
  if (input.available <= 0) return input.requested;
  const maximum = Math.min(input.available, Math.max(120, input.available - 180));
  const minimum = Math.min(160, maximum);
  return Math.max(minimum, Math.min(input.requested, maximum));
}
