import { useMemo } from "react";
import { View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { ProjectIconView } from "@/components/project-icon-view";
import { createProjectIconTarget } from "@/projects/icon-target";
import { useProjectIcons } from "@/projects/icons";
import { useProjects } from "@/hooks/use-projects";
import { getProjectHostEntry, getProjectSummaryForHostProject } from "@/utils/projects";
import type { WorkspaceDescriptor } from "@/stores/session-store";
import { densityIconProps } from "@/styles/density";
import { projectIconPlaceholderLabelFromDisplayName } from "@/utils/project-display-name";

const HeaderProjectIcon = withUnistyles(ProjectIconView);
const projectIconProps = densityIconProps("md", () => ({}));

interface WorkspaceHeaderIconProps {
  serverId: string;
  workspace: WorkspaceDescriptor | null;
}

export function WorkspaceHeaderIcon({ serverId, workspace }: WorkspaceHeaderIconProps) {
  const { projects } = useProjects({ enabled: workspace !== null });
  const project = workspace
    ? getProjectSummaryForHostProject(projects, serverId, workspace.projectId)
    : undefined;
  const host = getProjectHostEntry(project, serverId, workspace?.projectId);
  const targets = useMemo(() => {
    if (!project || !host) return [];
    const target = createProjectIconTarget({
      projectViewKey: project.viewKey,
      placement: { ...host, iconWorkingDir: host.repoRoot },
    });
    return target ? [target] : [];
  }, [host, project]);
  const icons = useProjectIcons({ projects: targets });
  const target = targets[0];
  if (!project || !target) return null;
  const initial = projectIconPlaceholderLabelFromDisplayName(project.projectName)
    .charAt(0)
    .toUpperCase();

  return (
    <View
      testID="workspace-header-icon"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <HeaderProjectIcon
        iconDataUri={icons.get(target.projectViewKey) ?? null}
        initial={initial}
        projectViewKey={target.projectViewKey}
        textStyle={styles.fallbackText}
        uniProps={projectIconProps}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fallbackText: { fontSize: 9 },
});
