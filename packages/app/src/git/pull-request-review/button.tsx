import { useCallback } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { TextSearch } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { create } from "zustand";
import { Button } from "@/components/ui/button";
import { HEADER_CONTROL_HEIGHT } from "@/components/ui/control-geometry";
import { useToast } from "@/contexts/toast-context";
import { useFormPreferences } from "@/hooks/use-form-preferences";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { toErrorMessage } from "@/utils/error-messages";
import { buildWorkspaceTabPersistenceKey } from "@/workspace-tabs/model";
import type { ReviewSubject } from "./context";
import { startReviewChat } from "./start";

interface PullRequestReviewState {
  inFlight: boolean;
  setInFlight: (inFlight: boolean) => void;
}

const usePullRequestReviewStore = create<PullRequestReviewState>((set) => ({
  inFlight: false,
  setInFlight: (inFlight) => set({ inFlight }),
}));

export function PullRequestReviewButton({
  serverId,
  workspaceId,
  cwd,
  subject,
  placement,
}: {
  serverId: string;
  workspaceId: string;
  cwd: string;
  subject: ReviewSubject;
  placement: "header" | "pane";
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const client = useHostRuntimeClient(serverId);
  const { preferences } = useFormPreferences();
  const inFlight = usePullRequestReviewStore((state) => state.inFlight);
  // COMPAT(checkoutDiffAll): added in v0.12.0, remove after 2027-04-21 once host floor includes All changes.
  const allChangesSupported = useSessionStore(
    (state) => state.sessions[serverId]?.serverInfo?.features?.checkoutDiffAll === true,
  );
  const label = inFlight
    ? t("workspace.git.pr.actions.reviewing")
    : t("workspace.git.pr.actions.review");

  const startReview = useCallback(() => {
    if (usePullRequestReviewStore.getState().inFlight) {
      return;
    }
    if (!client) {
      toast.error(t("workspace.terminal.hostDisconnected"));
      return;
    }
    // A local review against a base branch reads the "all" comparison.
    if (subject.kind === "local_changes" && subject.changes.baseRef && !allChangesSupported) {
      toast.error(t("workspace.git.pr.actions.reviewUpdateHost"));
      return;
    }
    const workspaceKey = buildWorkspaceTabPersistenceKey({ serverId, workspaceId });
    if (!workspaceKey) {
      toast.error(t("workspace.git.pr.actions.reviewFailed"));
      return;
    }
    usePullRequestReviewStore.getState().setInFlight(true);
    void startReviewChat({
      client,
      serverId,
      workspaceId,
      cwd,
      subject,
      preferences,
    })
      .then((started) => {
        useWorkspaceLayoutStore.getState().openTab({
          workspaceKey,
          target: started.target,
          intent: "reveal",
        });
        return;
      })
      .catch((error: unknown) => {
        toast.error(toErrorMessage(error) || t("workspace.git.pr.actions.reviewFailed"));
      })
      .finally(() => {
        usePullRequestReviewStore.getState().setInFlight(false);
      });
  }, [allChangesSupported, client, cwd, preferences, subject, serverId, t, toast, workspaceId]);

  return (
    <View style={placement === "header" ? styles.headerSlot : undefined}>
      <Button
        variant={placement === "header" ? "outline" : "ghost"}
        size="sm"
        leftIcon={TextSearch}
        loading={inFlight}
        disabled={inFlight}
        onPress={startReview}
        style={placement === "header" ? styles.headerButton : styles.paneButton}
        testID={placement === "header" ? "workspace-pull-request-review" : "pr-pane-review"}
        accessibilityLabel={t("workspace.git.pr.actions.review")}
      >
        {label}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  headerSlot: {
    justifyContent: "center",
  },
  headerButton: {
    height: HEADER_CONTROL_HEIGHT,
    minHeight: HEADER_CONTROL_HEIGHT,
    paddingHorizontal: theme.spacing[2],
  },
  paneButton: {
    gap: theme.spacing[1],
    minHeight: 24,
    height: 24,
    paddingVertical: 0,
    paddingHorizontal: theme.spacing[1],
    borderRadius: theme.borderRadius.base,
  },
}));
