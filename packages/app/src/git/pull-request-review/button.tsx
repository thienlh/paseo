import { useCallback, useMemo } from "react";
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
import { useCheckoutStatusQuery } from "@/git/use-status-query";
import { useCheckoutPrStatusQuery } from "@/git/use-pr-status-query";
import { selectPullRequestReviewSubject, selectReviewSubject, type ReviewSubject } from "./context";
import { startReviewChat } from "./start";

interface PullRequestReviewState {
  inFlight: boolean;
  setInFlight: (inFlight: boolean) => void;
}

const usePullRequestReviewStore = create<PullRequestReviewState>((set) => ({
  inFlight: false,
  setInFlight: (inFlight) => set({ inFlight }),
}));

function renderReviewIcon(color: string) {
  return <TextSearch size={16} color={color} />;
}

export function WorkspaceReviewButton({
  serverId,
  workspaceId,
  cwd,
}: {
  serverId: string;
  workspaceId: string;
  cwd: string;
}) {
  const { status } = useCheckoutStatusQuery({ serverId, cwd });
  const git = status && status.isGit ? status : null;
  const { status: pullRequest, forge } = useCheckoutPrStatusQuery({
    serverId,
    cwd,
    enabled: git !== null,
  });
  const subject = useMemo(() => {
    const currentPullRequest = pullRequest?.headRefName === git?.currentBranch ? pullRequest : null;
    return selectReviewSubject({
      pullRequest: selectPullRequestReviewSubject({ status: currentPullRequest, forge }),
      isDirty: Boolean(git?.isDirty),
      branch: git?.currentBranch,
      baseRef: git?.baseRef,
    });
  }, [forge, git, pullRequest]);
  if (!subject) return null;
  return (
    <PullRequestReviewButton
      serverId={serverId}
      workspaceId={workspaceId}
      cwd={cwd}
      subject={subject}
    />
  );
}

export function PullRequestReviewButton({
  serverId,
  workspaceId,
  cwd,
  subject,
}: {
  serverId: string;
  workspaceId: string;
  cwd: string;
  subject: ReviewSubject;
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
    <Button
      variant="default"
      size="sm"
      leftIcon={renderReviewIcon}
      loading={inFlight}
      disabled={inFlight}
      onPress={startReview}
      style={styles.button}
      textStyle={styles.buttonText}
      testID="checks-review-start"
      accessibilityLabel={t("workspace.git.pr.actions.review")}
    >
      {label}
    </Button>
  );
}

const styles = StyleSheet.create((theme) => ({
  button: {
    gap: theme.spacing[1],
    minHeight: HEADER_CONTROL_HEIGHT,
    height: HEADER_CONTROL_HEIGHT,
    paddingVertical: 0,
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
  },
  buttonText: {
    fontSize: theme.fontSize.base,
    lineHeight: theme.fontSize.base * 1.5,
    fontWeight: theme.fontWeight.normal,
  },
}));
