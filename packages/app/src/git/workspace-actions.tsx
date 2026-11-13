import { GitActionsSplitButton } from "@/git/actions-split-button";
import { GIT_ACTION_ICONS } from "@/git/action-icons";
import { useGitActions } from "@/git/use-actions";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { TitlebarDragRegion } from "@/components/desktop/titlebar-drag-region";
import { WindowChromeSafeArea } from "@/utils/desktop-window";
import { WORKSPACE_SECONDARY_HEADER_HEIGHT } from "@/constants/layout";
import { WorkspaceReviewButton } from "@/git/pull-request-review/button";

interface WorkspaceActionsProps {
  serverId: string;
  workspaceId: string;
  cwd: string;
}

export function WorkspaceActions({ serverId, workspaceId, cwd }: WorkspaceActionsProps) {
  const { gitActions } = useGitActions({
    serverId,
    cwd,
    icons: GIT_ACTION_ICONS,
  });

  return (
    <WindowChromeSafeArea placement="inline" style={styles.header} testID="git-workflow-bar">
      <TitlebarDragRegion />
      <View style={styles.content}>
        <WorkspaceReviewButton serverId={serverId} workspaceId={workspaceId} cwd={cwd} />
        <GitActionsSplitButton gitActions={gitActions} />
      </View>
    </WindowChromeSafeArea>
  );
}

const styles = StyleSheet.create((theme) => ({
  header: {
    height: WORKSPACE_SECONDARY_HEADER_HEIGHT,
    flexShrink: 0,
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.border,
  },
  content: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
  },
}));
