import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { MessageSquare, MessageSquarePlus } from "lucide-react-native";
import { withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import type { PullRequestContextAttachment } from "@/attachments/types";
import { useWorkspaceAttachmentsStore } from "@/attachments/workspace-attachments-store";
import { Button } from "@/components/ui/button";
import { useProviderIcon } from "@/components/provider-icons";
import {
  foregroundMutedColorMapping,
  Section,
  SummaryPill,
} from "@/git/pull-request-panel/section-kit";
import { findingSummary, formatFindingLocation, type ReviewFinding } from "./findings";
import { useLatestReviewFindings } from "./use-review-findings";

const ThemedMessageSquare = withUnistyles(MessageSquare);
const SUMMARY_FINDINGS_ICON = (
  <ThemedMessageSquare size={11} uniProps={foregroundMutedColorMapping} />
);

/**
 * The Review section of the Checks panel: lists the newest review's findings from
 * `.context/reviews`, each addable to a chat like a forge comment.
 */
export function ChecksReviewSection({
  serverId,
  cwd,
  workspaceAttachmentScopeKey,
}: {
  serverId: string;
  cwd: string;
  workspaceAttachmentScopeKey?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  const toggle = useCallback(() => setOpen((current) => !current), []);
  const latest = useLatestReviewFindings({ serverId, cwd }).data ?? null;
  const findings = latest?.findings ?? [];

  const addWorkspaceAttachment = useWorkspaceAttachmentsStore(
    (state) => state.addWorkspaceAttachment,
  );
  const addToChat = useCallback(
    (finding: ReviewFinding, index: number) => {
      if (!workspaceAttachmentScopeKey || !latest) return;
      addWorkspaceAttachment({
        scopeKey: workspaceAttachmentScopeKey,
        attachment: buildReviewFindingAttachment({
          finding,
          id: `${latest.fileName}:${index}`,
          cwd,
        }),
      });
    },
    [addWorkspaceAttachment, cwd, latest, workspaceAttachmentScopeKey],
  );

  const summary = useMemo(
    () => <SummaryPill count={findings.length} icon={SUMMARY_FINDINGS_ICON} variant="muted" />,
    [findings.length],
  );

  return (
    <Section title={t("checks.review.title")} open={open} onToggle={toggle} summary={summary}>
      <Text style={styles.description} numberOfLines={2}>
        {describeLatest(latest, t)}
      </Text>
      {findings.map((finding, index) => (
        <FindingRow
          key={`${latest?.fileName}:${finding.file}:${finding.line}:${finding.body}`}
          serverId={serverId}
          provider={latest?.provider ?? null}
          finding={finding}
          index={index}
          canAddToChat={workspaceAttachmentScopeKey !== undefined}
          onAddToChat={addToChat}
        />
      ))}
    </Section>
  );
}

function describeLatest(
  latest: ReturnType<typeof useLatestReviewFindings>["data"] | null,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  if (!latest) return t("checks.review.empty");
  if (latest.unreadable) return t("checks.review.unreadable");
  if (latest.findings.length === 0) return t("checks.review.noFindings");
  return t("checks.review.fromLatest", { count: latest.findings.length });
}

/** One finding: the reviewing provider's icon, a line to identify it, and Add to chat. */
function FindingRow({
  serverId,
  provider,
  finding,
  index,
  canAddToChat,
  onAddToChat,
}: {
  serverId: string;
  provider: string | null;
  finding: ReviewFinding;
  index: number;
  canAddToChat: boolean;
  onAddToChat: (finding: ReviewFinding, index: number) => void;
}) {
  const { t } = useTranslation();
  const ProviderIcon = useProviderIcon(provider ?? "", serverId);
  const handleAdd = useCallback(() => onAddToChat(finding, index), [finding, index, onAddToChat]);
  return (
    <View style={styles.row} testID="checks-review-finding">
      <ProviderIcon size={14} color={styles.providerIcon.color} />
      <Text style={styles.summary} numberOfLines={1}>
        {findingSummary(finding)}
      </Text>
      {canAddToChat ? (
        <Button
          variant="ghost"
          size="sm"
          leftIcon={MessageSquarePlus}
          onPress={handleAdd}
          testID="checks-review-finding-add"
        >
          {t("workspace.git.pr.actions.addToChat")}
        </Button>
      ) : null}
    </View>
  );
}

export function buildReviewFindingAttachment(input: {
  finding: ReviewFinding;
  id: string;
  cwd: string;
}): PullRequestContextAttachment {
  const location = formatFindingLocation(input.finding, input.cwd);
  const lines = [
    "Review finding",
    `Location: ${location ?? "the change as a whole"}`,
    "",
    ...(input.finding.title ? [input.finding.title] : []),
    input.finding.body,
  ];
  return {
    kind: "paseo.review_finding",
    id: input.id,
    title: input.finding.title ?? location ?? "Review finding",
    subtitle: location ?? undefined,
    text: lines.join("\n"),
    url: null,
  };
}

const styles = StyleSheet.create((theme) => ({
  description: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
    paddingHorizontal: theme.spacing[3],
    paddingBottom: theme.spacing[2],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    marginHorizontal: theme.spacing[3],
    marginBottom: theme.spacing[1],
    paddingLeft: theme.spacing[2],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
  },
  providerIcon: {
    color: theme.colors.foregroundMuted,
  },
  summary: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
}));
