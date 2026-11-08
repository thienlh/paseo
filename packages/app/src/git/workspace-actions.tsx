import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { GitActionsSplitButton } from "@/git/actions-split-button";
import { GIT_ACTION_ICONS } from "@/git/action-icons";
import { PullRequestReviewButton } from "@/git/pull-request-review/button";
import { useGitActions } from "@/git/use-actions";

interface WorkspaceActionsProps {
  serverId: string;
  workspaceId: string;
  cwd: string;
}

export function WorkspaceActions({ serverId, workspaceId, cwd }: WorkspaceActionsProps) {
  const { gitActions, reviewSubject } = useGitActions({
    serverId,
    cwd,
    icons: GIT_ACTION_ICONS,
  });

  return (
    <View style={styles.row}>
      {reviewSubject ? (
        <PullRequestReviewButton
          serverId={serverId}
          workspaceId={workspaceId}
          cwd={cwd}
          subject={reviewSubject}
          placement="header"
        />
      ) : null}
      <GitActionsSplitButton gitActions={gitActions} />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
}));
