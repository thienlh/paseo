import { ListChecks } from "lucide-react-native";
import { withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import type { PanelPresentation } from "@/panels/panel-registry";
const ThemedListChecks = withUnistyles(ListChecks);
export const pullRequestPanelPresentation = {
  label: (t) => t("panels.pullRequest.label"),
  subtitle: (t) => t("panels.pullRequest.subtitle"),
  tooltip: (t) => t("panels.pullRequest.label"),
  icon: ThemedListChecks,
} satisfies PanelPresentation;
/** The tab is always "Checks"; the pull request number shows inside the panel. */
export function usePullRequestPanelDescriptor(
  _target: { kind: "pull_request" },
  _context: { serverId: string; workspaceId: string },
) {
  const { t } = useTranslation();
  const label = pullRequestPanelPresentation.label(t);
  return {
    label,
    subtitle: pullRequestPanelPresentation.subtitle(t),
    tooltip: label,
    titleState: "ready" as const,
    icon: pullRequestPanelPresentation.icon,
    statusBucket: null,
  };
}
