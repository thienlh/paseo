import { useCallback, useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { buildWorkspaceAttachmentScopeKey } from "@/attachments/workspace-attachments-store";
import { useToast } from "@/contexts/toast-context";
import { useCheckoutGitActionsStore } from "@/git/actions-store";
import {
  PullRequestPane,
  PullRequestPaneError,
  PullRequestPaneSkeleton,
} from "@/git/pull-request-panel";
import type { UsePrPaneDataResult } from "@/git/pull-request-panel/use-data";
import { ChecksReviewSection } from "@/git/pull-request-review/checks-review-section";

import { resolvePullRequestContentState } from "./state";
export {
  useWorkspacePullRequestDiscovery,
  useHasPullRequest,
  usePullRequestAutoAdd,
} from "./discovery";
export { usePullRequestData } from "./data";

export function PullRequestContent(input: {
  serverId: string;
  workspaceId?: string | null;
  cwd: string;
  prPane: UsePrPaneDataResult;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const refresh = useCheckoutGitActionsStore((state) => state.refresh);
  const onRetry = useCallback(() => {
    void refresh({ serverId: input.serverId, cwd: input.cwd }).catch((error) => {
      toast.error(error instanceof Error ? error.message : t("workspace.git.diff.failedRefresh"));
    });
  }, [input.cwd, input.serverId, refresh, t, toast]);
  const workspaceAttachmentScopeKey = buildWorkspaceAttachmentScopeKey({
    serverId: input.serverId,
    workspaceId: input.workspaceId,
    cwd: input.cwd,
  });
  const data = input.prPane.data;
  const reviewSection = useMemo(
    () => (
      <ChecksReviewSection
        serverId={input.serverId}
        cwd={input.cwd}
        workspaceAttachmentScopeKey={workspaceAttachmentScopeKey}
      />
    ),
    [input.cwd, input.serverId, workspaceAttachmentScopeKey],
  );

  if (data) {
    return (
      <PullRequestPane
        serverId={input.serverId}
        cwd={input.cwd}
        data={data}
        activityLoading={input.prPane.activityLoading}
        workspaceAttachmentScopeKey={workspaceAttachmentScopeKey}
        reviewSection={reviewSection}
      />
    );
  }
  const contentState = resolvePullRequestContentState(input.prPane);
  if (contentState === "error") {
    return <PullRequestPaneError onRetry={onRetry} />;
  }
  if (contentState === "loading") {
    return <PullRequestPaneSkeleton />;
  }
  return (
    <ScrollView style={styles.scroll} testID="pull-request-empty-state">
      {reviewSection}
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>{t("panels.pullRequest.emptyTitle")}</Text>
        <Text style={styles.emptyDescription}>{t("panels.pullRequest.emptyDescription")}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme) => ({
  scroll: {
    flex: 1,
  },
  empty: {
    alignItems: "center",
    gap: 8,
    padding: 24,
  },
  emptyTitle: {
    color: theme.colors.foreground,
  },
  emptyDescription: {
    color: theme.colors.foregroundMuted,
  },
}));
