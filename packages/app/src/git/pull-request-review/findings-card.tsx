import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { MessageSquarePlus, Plus } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useIsCompactFormFactor } from "@/constants/layout";
import { useToast } from "@/contexts/toast-context";
import { useCheckoutStatusQuery } from "@/git/use-status-query";
import { useChangesPreferences } from "@/hooks/use-changes-preferences";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";
import { toErrorMessage } from "@/utils/error-messages";
import { openExplorerSidebarView } from "@/workspace-tabs/explorer-sidebar";
import { buildWorkspaceTabPersistenceKey } from "@/workspace-tabs/model";
import { addReviewFindingsToChanges, type AddedReviewFindings } from "./add-findings";
import { normalizeFindingPath, type ReviewFinding, type ReviewFindingsBlock } from "./findings";

const NO_FINDINGS: readonly ReviewFinding[] = [];

type AddingTarget = { kind: "all" } | { kind: "one"; finding: ReviewFinding } | null;

/**
 * The findings section of a review reply. The review lists its findings only here, so each one
 * can carry its own Add button; Add stays available so a finding can be added again after its
 * comment was discarded.
 */
export function ReviewFindingsCard({
  serverId,
  workspaceId,
  cwd,
  block,
}: {
  serverId: string;
  workspaceId: string;
  cwd: string;
  block: Extract<ReviewFindingsBlock, { status: "pending" | "ready" }>;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const isCompact = useIsCompactFormFactor();
  const client = useHostRuntimeClient(serverId);
  const { preferences } = useChangesPreferences();
  const { status } = useCheckoutStatusQuery({ serverId, cwd });
  const modernDiff = useSessionStore(
    (state) => state.sessions[serverId]?.serverInfo?.features?.diffSubscription === true,
  );
  // COMPAT(checkoutDiffAll): added in v0.12.0, remove after 2027-04-21 once host floor includes All changes.
  const allChangesSupported = useSessionStore(
    (state) => state.sessions[serverId]?.serverInfo?.features?.checkoutDiffAll === true,
  );
  const gitStatus = status && status.isGit ? status : null;
  // Same base the Changes pane compares against; its comments are keyed by it.
  // COMPAT(diffSubscription): added in v0.15.0, remove after 2027-05-06.
  const baseRef = (modernDiff ? gitStatus?.comparisonBaseRef : gitStatus?.baseRef) ?? undefined;
  const [adding, setAdding] = useState<AddingTarget>(null);

  const findings = block.status === "ready" ? block.findings : NO_FINDINGS;

  const add = useCallback(
    (target: NonNullable<AddingTarget>) => {
      if (!client) {
        toast.error(t("workspace.terminal.hostDisconnected"));
        return;
      }
      // Findings go on the "all" comparison whenever the workspace has a base branch.
      if (baseRef && !allChangesSupported) {
        toast.error(t("reviewFindings.updateHost"));
        return;
      }
      setAdding(target);
      void addReviewFindingsToChanges({
        client,
        serverId,
        workspaceId,
        cwd,
        baseRef,
        ignoreWhitespace: preferences.hideWhitespace,
        findings: target.kind === "all" ? findings : [target.finding],
      })
        .then((result) => {
          toast.show(describeResult(result, t), {
            variant: result.added > 0 ? "success" : undefined,
          });
          // Adding one at a time keeps the user in the chat; adding them all is the hand-off.
          if (target.kind === "all" && result.added > 0) {
            openExplorerSidebarView({
              isCompact,
              workspaceKey: buildWorkspaceTabPersistenceKey({ serverId, workspaceId }),
              view: "changes",
            });
          }
          return;
        })
        .catch((error: unknown) => {
          toast.error(toErrorMessage(error) || t("reviewFindings.addFailed"));
        })
        .finally(() => setAdding(null));
    },
    [
      allChangesSupported,
      baseRef,
      client,
      cwd,
      findings,
      isCompact,
      preferences.hideWhitespace,
      serverId,
      t,
      toast,
      workspaceId,
    ],
  );
  const addAll = useCallback(() => add({ kind: "all" }), [add]);
  const addOne = useCallback((finding: ReviewFinding) => add({ kind: "one", finding }), [add]);

  if (block.status === "pending") {
    return (
      <View style={styles.card} testID="review-findings-card">
        <Text style={styles.title}>{t("reviewFindings.preparing")}</Text>
      </View>
    );
  }

  return (
    <View style={styles.card} testID="review-findings-card">
      <View style={styles.header}>
        <Text style={styles.title}>{t("reviewFindings.title", { count: findings.length })}</Text>
        {findings.length > 1 ? (
          <Button
            variant="outline"
            size="sm"
            leftIcon={MessageSquarePlus}
            loading={adding?.kind === "all"}
            disabled={adding !== null}
            onPress={addAll}
            testID="review-findings-add"
          >
            {adding?.kind === "all" ? t("reviewFindings.adding") : t("reviewFindings.add")}
          </Button>
        ) : null}
      </View>
      {findings.map((finding, index) => (
        <FindingRow
          key={`${finding.file}:${finding.side}:${finding.line}:${finding.body}`}
          number={index + 1}
          finding={finding}
          location={
            finding.file === null
              ? t("reviewFindings.general")
              : formatFindingLocation(normalizeFindingPath(finding.file, cwd), finding.line)
          }
          adding={adding?.kind === "one" && adding.finding === finding}
          disabled={adding !== null}
          onAdd={addOne}
        />
      ))}
      {block.invalidCount > 0 ? (
        <Text style={styles.note}>
          {t("reviewFindings.unreadable", { count: block.invalidCount })}
        </Text>
      ) : null}
    </View>
  );
}

function FindingRow({
  number,
  finding,
  location,
  adding,
  disabled,
  onAdd,
}: {
  number: number;
  finding: ReviewFinding;
  location: string;
  adding: boolean;
  disabled: boolean;
  onAdd: (finding: ReviewFinding) => void;
}) {
  const { t } = useTranslation();
  const handleAdd = useCallback(() => onAdd(finding), [finding, onAdd]);
  return (
    <View style={styles.row} testID="review-finding">
      <Text style={styles.number}>{`${number}.`}</Text>
      <View style={styles.content}>
        <Text style={styles.heading}>
          {finding.title ? <Text style={styles.findingTitle}>{`${finding.title}  `}</Text> : null}
          <Text style={styles.location}>{location}</Text>
        </Text>
        <Text selectable style={styles.body}>
          {finding.body}
        </Text>
      </View>
      <Button
        variant="ghost"
        size="sm"
        leftIcon={Plus}
        loading={adding}
        disabled={disabled}
        onPress={handleAdd}
        testID="review-finding-add"
        accessibilityLabel={`${t("reviewFindings.addOne")} ${finding.title ?? location}`}
      >
        {t("reviewFindings.addOne")}
      </Button>
    </View>
  );
}

function formatFindingLocation(path: string, line: number | null): string {
  return line === null ? path : `${path}:${line}`;
}

function describeResult(
  result: AddedReviewFindings,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  const parts: string[] = [];
  if (result.added > 0) parts.push(t("reviewFindings.added", { count: result.added }));
  if (result.moved > 0) parts.push(t("reviewFindings.moved", { count: result.moved }));
  if (result.offDiff > 0) parts.push(t("reviewFindings.offDiff", { count: result.offDiff }));
  return parts.join(" ");
}

const styles = StyleSheet.create((theme) => ({
  card: {
    marginTop: theme.spacing[3],
    padding: theme.spacing[3],
    gap: theme.spacing[3],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    minHeight: 28,
  },
  title: {
    flexShrink: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[2],
  },
  number: {
    minWidth: 18,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
  content: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[1],
  },
  heading: {
    fontSize: theme.fontSize.base,
  },
  findingTitle: {
    color: theme.colors.foreground,
    fontWeight: theme.fontWeight.medium,
  },
  location: {
    color: theme.colors.foregroundMuted,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.sm,
  },
  body: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    lineHeight: theme.fontSize.base * 1.5,
  },
  note: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
}));
