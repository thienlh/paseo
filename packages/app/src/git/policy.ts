import type { ReactElement } from "react";

import type { ActionStatus } from "@/components/ui/dropdown-menu";
import { i18n } from "@/i18n/i18next";
import type { PullRequestMergeable } from "@getpaseo/protocol/messages";

import type { MergeCapability } from "./merge-capability";

export type GitActionId =
  | "commit"
  | "pull"
  | "push"
  | "pull-and-push"
  | "pr"
  | "merge-pr"
  | "enable-pr-auto-merge"
  | "disable-pr-auto-merge"
  | "merge-branch"
  | "merge-from-base"
  | "archive-workspace"
  | "continue-workspace"
  | "fix-pr";

export interface GitAction {
  id: GitActionId;
  label: string;
  pendingLabel: string;
  successLabel: string;
  disabled: boolean;
  status: ActionStatus;
  unavailableMessage?: string;
  icon?: ReactElement;
  /** When true, a menu separator should be rendered before this item. */
  startsGroup: boolean;
  handler: () => void;
}

export interface GitActions {
  workflow?: import("./workflow").GitWorkflowState;
  continueAction?: GitAction;
  primary: GitAction | null;
  secondary: GitAction[];
  menu: GitAction[];
}

interface GitActionRuntimeState {
  disabled: boolean;
  status: ActionStatus;
  icon?: ReactElement;
  handler: () => void;
}

export function isCurrentBranchBase(
  currentBranch: string | null | undefined,
  baseRef: string | null | undefined,
): boolean {
  if (!currentBranch || !baseRef) return false;
  if (baseRef.startsWith("refs/heads/")) return baseRef === `refs/heads/${currentBranch}`;
  if (baseRef.startsWith("refs/")) return false;
  // Older hosts send a display name, which cannot distinguish a local ref from its remote.
  return currentBranch === baseRef.replace(/^origin\//, "");
}

export function canMergeIntoLocalBase(
  currentBranch: string | null | undefined,
  baseRef: string | null | undefined,
): boolean {
  if (!currentBranch || !baseRef) return false;
  if (baseRef.startsWith("refs/remotes/") && !baseRef.startsWith("refs/remotes/origin/")) {
    return false;
  }
  const localTarget = baseRef.replace(/^(?:refs\/heads\/|refs\/remotes\/origin\/|origin\/)/, "");
  return currentBranch !== localTarget;
}

export interface BuildGitActionsInput {
  isGit: boolean;
  githubFeaturesEnabled: boolean;
  /** Forge brand label (e.g. "GitHub", "GitLab") for forge-neutral unavailable copy. */
  forgeBrandLabel: string;
  /** Short change-request noun label (e.g. "PR", "MR") for forge-neutral unavailable copy. */
  forgeChangeRequestNoun: string;
  githubAutoMergeActionsEnabled: boolean;
  hasPullRequest: boolean;
  pullRequestUrl: string | null;
  pullRequestState: "open" | "closed" | null;
  pullRequestIsDraft: boolean;
  pullRequestIsMerged: boolean;
  pullRequestMergeable: PullRequestMergeable;
  mergeCapability: MergeCapability | null;
  hasRemote: boolean;
  isPaseoOwnedWorktree: boolean;
  isOnBaseBranch: boolean;
  canMergeLocally: boolean;
  hasUncommittedChanges: boolean;
  baseRefAvailable: boolean;
  baseRefLabel: string;
  aheadCount: number;
  behindBaseCount: number;
  aheadOfOrigin: number | null;
  behindOfOrigin: number | null;
  shouldPromoteArchive: boolean;
  shipDefault: "merge" | "pr";
  workflow?: import("./workflow").GitWorkflowState;
  runtime: Record<GitActionId, GitActionRuntimeState>;
}

type PullRequestActionId = Extract<
  GitActionId,
  "pr" | "merge-pr" | "enable-pr-auto-merge" | "disable-pr-auto-merge"
>;
type PullRequestActionRole = "status" | "direct" | "auto";

interface PullRequestActionModel {
  readonly id: PullRequestActionId;
  readonly role: PullRequestActionRole;
  readonly build: (input: BuildGitActionsInput) => GitAction;
}

const PULL_REQUEST_ACTION_MODELS: readonly PullRequestActionModel[] = [
  { id: "pr", role: "status", build: buildPrAction },
  { id: "merge-pr", role: "direct", build: buildDirectPullRequestMergeAction },
  { id: "enable-pr-auto-merge", role: "auto", build: buildEnablePullRequestAutoMergeAction },
  {
    id: "disable-pr-auto-merge",
    role: "auto",
    build: buildDisablePullRequestAutoMergeAction,
  },
];

const REMOTE_ACTION_IDS: GitActionId[] = ["pull", "push", "pull-and-push"];

export function narrowPullRequestState(state: string | null | undefined): "open" | "closed" | null {
  if (state === "open") return "open";
  if (state === "closed") return "closed";
  return null;
}

export function buildGitActions(input: BuildGitActionsInput): GitActions {
  if (!input.isGit) {
    return { primary: null, secondary: [], menu: [] };
  }

  const allActions = new Map<GitActionId, GitAction>();

  allActions.set("commit", {
    id: "commit",
    label: i18n.t(
      input.hasRemote
        ? "workspace.git.actions.commit.pushLabel"
        : "workspace.git.actions.commit.label",
    ),
    pendingLabel: i18n.t("workspace.git.actions.commit.pending"),
    successLabel: i18n.t("workspace.git.actions.commit.success"),
    disabled: input.runtime.commit.disabled,
    status: input.runtime.commit.status,
    icon: input.runtime.commit.icon,
    startsGroup: false,
    handler: input.runtime.commit.handler,
  });

  allActions.set("pull", {
    id: "pull",
    label: i18n.t("workspace.git.actions.pull.label"),
    pendingLabel: i18n.t("workspace.git.actions.pull.pending"),
    successLabel: i18n.t("workspace.git.actions.pull.success"),
    disabled: input.runtime.pull.disabled,
    status: input.runtime.pull.status,
    unavailableMessage: input.runtime.pull.disabled ? undefined : getPullUnavailableMessage(input),
    icon: input.runtime.pull.icon,
    startsGroup: false,
    handler: input.runtime.pull.handler,
  });

  allActions.set("push", {
    id: "push",
    label: i18n.t("workspace.git.actions.push.label"),
    pendingLabel: i18n.t("workspace.git.actions.push.pending"),
    successLabel: i18n.t("workspace.git.actions.push.success"),
    disabled: input.runtime.push.disabled,
    status: input.runtime.push.status,
    unavailableMessage: input.runtime.push.disabled ? undefined : getPushUnavailableMessage(input),
    icon: input.runtime.push.icon,
    startsGroup: false,
    handler: input.runtime.push.handler,
  });

  allActions.set("pull-and-push", {
    id: "pull-and-push",
    label: i18n.t("workspace.git.actions.pullAndPush.label"),
    pendingLabel: i18n.t("workspace.git.actions.pullAndPush.pending"),
    successLabel: i18n.t("workspace.git.actions.pullAndPush.success"),
    disabled: input.runtime["pull-and-push"].disabled,
    status: input.runtime["pull-and-push"].status,
    unavailableMessage: input.runtime["pull-and-push"].disabled
      ? undefined
      : getPullAndPushUnavailableMessage(input),
    icon: input.runtime["pull-and-push"].icon,
    startsGroup: false,
    handler: input.runtime["pull-and-push"].handler,
  });

  for (const model of PULL_REQUEST_ACTION_MODELS) {
    allActions.set(model.id, model.build(input));
  }

  allActions.set("merge-branch", {
    id: "merge-branch",
    label: i18n.t("workspace.git.actions.mergeBranch.label"),
    pendingLabel: i18n.t("workspace.git.actions.mergeBranch.pending"),
    successLabel: i18n.t("workspace.git.actions.mergeBranch.success"),
    disabled: input.runtime["merge-branch"].disabled,
    status: input.runtime["merge-branch"].status,
    unavailableMessage: input.runtime["merge-branch"].disabled
      ? undefined
      : getMergeBranchUnavailableMessage(input),
    icon: input.runtime["merge-branch"].icon,
    startsGroup: false,
    handler: input.runtime["merge-branch"].handler,
  });

  allActions.set("merge-from-base", {
    id: "merge-from-base",
    label: i18n.t("workspace.git.actions.mergeFromBase.label", { baseRef: input.baseRefLabel }),
    pendingLabel: i18n.t("workspace.git.actions.mergeFromBase.pending"),
    successLabel: i18n.t("workspace.git.actions.mergeFromBase.success"),
    disabled: input.runtime["merge-from-base"].disabled,
    status: input.runtime["merge-from-base"].status,
    unavailableMessage: input.runtime["merge-from-base"].disabled
      ? undefined
      : getMergeFromBaseUnavailableMessage(input),
    icon: input.runtime["merge-from-base"].icon,
    startsGroup: true,
    handler: input.runtime["merge-from-base"].handler,
  });

  allActions.set("archive-workspace", {
    id: "archive-workspace",
    label: i18n.t("workspace.git.actions.archive.label"),
    pendingLabel: i18n.t("workspace.git.actions.archive.pending"),
    successLabel: i18n.t("workspace.git.actions.archive.success"),
    disabled: input.runtime["archive-workspace"].disabled,
    status: input.runtime["archive-workspace"].status,
    icon: input.runtime["archive-workspace"].icon,
    startsGroup: true,
    handler: input.runtime["archive-workspace"].handler,
  });

  for (const id of ["continue-workspace", "fix-pr"] as const) {
    const label = i18n.t(`workspace.git.actions.${id === "fix-pr" ? "fixPr" : "continue"}`);
    allActions.set(id, {
      id,
      label,
      pendingLabel: label,
      successLabel: label,
      startsGroup: false,
      ...input.runtime[id],
    });
  }
  const primaryActionId = getPrimaryActionId(input);
  const primary = primaryActionId ? (allActions.get(primaryActionId) ?? null) : null;

  const secondaryIds: GitActionId[] = input.hasUncommittedChanges
    ? ["commit", ...REMOTE_ACTION_IDS]
    : [...REMOTE_ACTION_IDS];
  if (!input.isOnBaseBranch) {
    secondaryIds.push(...getFeatureActionIds(input));
  }
  secondaryIds.push("archive-workspace");

  return {
    primary,
    ...(input.shouldPromoteArchive ? { continueAction: allActions.get("continue-workspace") } : {}),
    secondary: secondaryIds
      .filter((id) => id !== "archive-workspace" || primaryActionId !== "archive-workspace")
      .map((id) => allActions.get(id)!),
    menu: [],
  };
}

/**
 * The actions a flattened list shows after the primary. `secondary` keeps the actions the policy
 * can promote to `primary`, and the translator rebuilds those objects, so a flattening consumer
 * has to drop the promoted one by id or it renders it twice.
 */
export function actionsWithoutPrimary(gitActions: GitActions): GitAction[] {
  const primaryActionId = gitActions.primary?.id;
  return [
    ...(gitActions.continueAction ? [gitActions.continueAction] : []),
    ...gitActions.secondary,
    ...gitActions.menu,
  ].filter((action) => action.id !== primaryActionId);
}

function canStartPullRequest(input: BuildGitActionsInput): boolean {
  return (
    !input.hasPullRequest &&
    !input.isOnBaseBranch &&
    input.hasRemote &&
    input.githubFeaturesEnabled &&
    input.shipDefault === "pr" &&
    (input.hasUncommittedChanges || input.aheadCount > 0)
  );
}

function canShipLocally(input: BuildGitActionsInput): boolean {
  return !input.isOnBaseBranch && input.canMergeLocally && input.aheadCount > 0;
}

function getPrimaryActionId(input: BuildGitActionsInput): GitActionId | null {
  if (input.shouldPromoteArchive) {
    return "archive-workspace";
  }
  if (canStartPullRequest(input)) return "pr";
  if (input.pullRequestIsMerged && input.hasPullRequest) return "continue-workspace";
  if (input.hasUncommittedChanges) {
    return "commit";
  }
  if (canPull(input)) {
    return "pull";
  }
  if (canPush(input)) {
    return "push";
  }
  if (input.workflow === "attention") return "fix-pr";
  if (canMergePr(input)) {
    return "merge-pr";
  }
  if (canEnablePrAutoMerge(input)) {
    return "enable-pr-auto-merge";
  }
  if (hasEnabledPrAutoMerge(input)) {
    return "pr";
  }
  if (input.shipDefault === "pr" && canUsePullRequestActionAsShipDefault(input)) {
    return "pr";
  }
  if (canShipLocally(input)) {
    return "merge-branch";
  }
  if (!input.isOnBaseBranch && canMergeFromBase(input)) {
    return "merge-from-base";
  }
  if (input.githubFeaturesEnabled && input.hasPullRequest && input.pullRequestUrl) {
    return "pr";
  }

  return null;
}

function getPullRequestActionIds(filter: {
  roles: readonly PullRequestActionRole[];
  input: BuildGitActionsInput;
}): PullRequestActionId[] {
  return PULL_REQUEST_ACTION_MODELS.filter((model) => filter.roles.includes(model.role))
    .filter((model) => shouldShowPullRequestAction(filter.input, model.id))
    .map((model) => model.id);
}

function getFeatureActionIds(input: BuildGitActionsInput): GitActionId[] {
  return [
    "merge-from-base",
    ...(input.canMergeLocally ? (["merge-branch"] as const) : []),
    ...getPullRequestActionIds({ roles: ["status", "direct", "auto"], input }),
  ];
}

function buildPrAction(input: BuildGitActionsInput): GitAction {
  if (input.hasPullRequest && input.pullRequestUrl) {
    return {
      id: "pr",
      label: i18n.t("workspace.git.actions.viewPr"),
      pendingLabel: i18n.t("workspace.git.actions.viewPr"),
      successLabel: i18n.t("workspace.git.actions.viewPr"),
      disabled: input.runtime.pr.disabled,
      status: input.runtime.pr.status,
      unavailableMessage:
        input.runtime.pr.disabled || input.githubFeaturesEnabled
          ? undefined
          : i18n.t("workspace.git.actions.unavailable.viewPrNoForge", {
              brand: input.forgeBrandLabel,
              noun: input.forgeChangeRequestNoun,
            }),
      icon: input.runtime.pr.icon,
      startsGroup: false,
      handler: input.runtime.pr.handler,
    };
  }

  return {
    id: "pr",
    label: i18n.t("workspace.git.actions.createPr.label"),
    pendingLabel: i18n.t("workspace.git.actions.createPr.pending"),
    successLabel: i18n.t("workspace.git.actions.createPr.success"),
    disabled: input.runtime.pr.disabled,
    status: input.runtime.pr.status,
    unavailableMessage: input.runtime.pr.disabled
      ? undefined
      : getCreatePrUnavailableMessage(input),
    icon: input.runtime.pr.icon,
    startsGroup: false,
    handler: input.runtime.pr.handler,
  };
}

function buildDirectPullRequestMergeAction(input: BuildGitActionsInput): GitAction {
  const runtime = input.runtime["merge-pr"];
  const unavailableMessage = getMergePrUnavailableMessage(input);
  return {
    id: "merge-pr",
    label: i18n.t("workspace.git.actions.mergePr.label"),
    pendingLabel: i18n.t("workspace.git.actions.mergePr.pending"),
    successLabel: i18n.t("workspace.git.actions.mergePr.success"),
    disabled: runtime.disabled || shouldDisableMergePrAction(input),
    status: runtime.status,
    unavailableMessage: runtime.disabled ? undefined : unavailableMessage,
    icon: runtime.icon,
    startsGroup: true,
    handler: runtime.handler,
  };
}

function buildEnablePullRequestAutoMergeAction(input: BuildGitActionsInput): GitAction {
  const runtime = input.runtime["enable-pr-auto-merge"];
  return {
    id: "enable-pr-auto-merge",
    label: i18n.t("workspace.git.actions.autoMerge.enable"),
    pendingLabel: i18n.t("workspace.git.actions.autoMerge.enabling"),
    successLabel: i18n.t("workspace.git.actions.autoMerge.enabled"),
    disabled: runtime.disabled,
    status: runtime.status,
    icon: runtime.icon,
    startsGroup: true,
    handler: runtime.handler,
  };
}

function buildDisablePullRequestAutoMergeAction(input: BuildGitActionsInput): GitAction {
  const runtime = input.runtime["disable-pr-auto-merge"];
  const unavailableMessage =
    input.mergeCapability?.canDisableAutoMerge === true
      ? undefined
      : i18n.t("workspace.git.actions.unavailable.autoMergeCannotDisable");
  return {
    id: "disable-pr-auto-merge",
    label: i18n.t("workspace.git.actions.autoMerge.enabled"),
    pendingLabel: i18n.t("workspace.git.actions.autoMerge.disabling"),
    successLabel: i18n.t("workspace.git.actions.autoMerge.disabled"),
    disabled: runtime.disabled || input.mergeCapability?.canDisableAutoMerge !== true,
    status: runtime.status,
    unavailableMessage: runtime.disabled ? undefined : unavailableMessage,
    icon: runtime.icon,
    startsGroup: true,
    handler: runtime.handler,
  };
}

function canPull(input: BuildGitActionsInput): boolean {
  return input.hasRemote && !input.hasUncommittedChanges && (input.behindOfOrigin ?? 0) > 0;
}

function canPush(input: BuildGitActionsInput): boolean {
  return input.hasRemote && hasPushableCommits(input) && (input.behindOfOrigin ?? 0) === 0;
}

function hasPushableCommits(input: BuildGitActionsInput): boolean {
  if ((input.aheadOfOrigin ?? 0) > 0) {
    return true;
  }
  // No-upstream Paseo worktrees are first-pushable: the daemon push sets upstream with `git push -u`.
  // Do not fold this into aheadOfOrigin; null also covers deleted/pruned upstream branches.
  return input.isPaseoOwnedWorktree && input.aheadOfOrigin === null && input.aheadCount > 0;
}

function canMergeFromBase(input: BuildGitActionsInput): boolean {
  return (
    !input.isOnBaseBranch &&
    input.baseRefAvailable &&
    !input.hasUncommittedChanges &&
    input.behindBaseCount > 0
  );
}

function canUsePullRequestActionAsShipDefault(input: BuildGitActionsInput): boolean {
  if (input.isOnBaseBranch || !input.githubFeaturesEnabled) {
    return false;
  }
  if (input.hasPullRequest) {
    return input.pullRequestUrl !== null;
  }
  return input.aheadCount > 0;
}

function canMergePr(input: BuildGitActionsInput): boolean {
  const capability = input.mergeCapability;
  const canMergeFromPullRequestStatus =
    input.githubFeaturesEnabled &&
    input.hasPullRequest &&
    input.pullRequestState === "open" &&
    !input.pullRequestIsDraft &&
    !input.pullRequestIsMerged &&
    input.pullRequestMergeable !== "CONFLICTING" &&
    input.aheadCount > 0 &&
    !input.hasUncommittedChanges;

  if (!canMergeFromPullRequestStatus) {
    return false;
  }

  if (capability === null) {
    return (
      input.pullRequestMergeable === "MERGEABLE" &&
      input.behindOfOrigin === 0 &&
      input.aheadOfOrigin === 0 &&
      !canMergeFromBase(input)
    );
  }

  return (
    capability.directMergeReady &&
    !capability.autoMergeEnabled &&
    !capability.mergeBlockedByQueue &&
    capability.allowedMethods.length > 0
  );
}

function canEnablePrAutoMerge(input: BuildGitActionsInput): boolean {
  const capability = input.mergeCapability;
  return (
    input.githubFeaturesEnabled &&
    input.githubAutoMergeActionsEnabled &&
    input.hasPullRequest &&
    input.pullRequestState === "open" &&
    !input.pullRequestIsDraft &&
    !input.pullRequestIsMerged &&
    input.pullRequestMergeable !== "CONFLICTING" &&
    capability !== null &&
    !capability.autoMergeEnabled &&
    capability.canEnableAutoMerge &&
    !capability.mergeBlockedByQueue &&
    capability.allowedMethods.length > 0
  );
}

function hasEnabledPrAutoMerge(input: BuildGitActionsInput): boolean {
  return (
    input.githubFeaturesEnabled &&
    input.hasPullRequest &&
    input.pullRequestUrl !== null &&
    input.mergeCapability?.autoMergeEnabled === true
  );
}

function getPullUnavailableMessage(input: BuildGitActionsInput): string | undefined {
  if (!input.hasRemote) {
    return i18n.t("workspace.git.actions.unavailable.pullNoRemote");
  }
  if (input.hasUncommittedChanges) {
    return i18n.t("workspace.git.actions.unavailable.pullDirty");
  }
  if (input.behindOfOrigin === null) {
    return i18n.t("workspace.git.actions.unavailable.pullNoRemote");
  }
  if (input.behindOfOrigin === 0) {
    return i18n.t("workspace.git.actions.unavailable.pullUpToDate");
  }
  return undefined;
}

function getPushUnavailableMessage(input: BuildGitActionsInput): string | undefined {
  if (!input.hasRemote) {
    return i18n.t("workspace.git.actions.unavailable.pushNoRemote");
  }
  if ((input.behindOfOrigin ?? 0) > 0) {
    return i18n.t("workspace.git.actions.unavailable.pushBehind");
  }
  if (!hasPushableCommits(input)) {
    return i18n.t("workspace.git.actions.unavailable.pushNothing");
  }
  return undefined;
}

function getPullAndPushUnavailableMessage(input: BuildGitActionsInput): string | undefined {
  if (!input.hasRemote) {
    return i18n.t("workspace.git.actions.unavailable.pullAndPushNoRemote");
  }
  if (input.hasUncommittedChanges) {
    return i18n.t("workspace.git.actions.unavailable.pullAndPushDirty");
  }
  if (input.behindOfOrigin === null) {
    return i18n.t("workspace.git.actions.unavailable.pullAndPushNoIncoming");
  }
  if (input.behindOfOrigin === 0 && input.aheadOfOrigin === 0) {
    return i18n.t("workspace.git.actions.unavailable.pullAndPushInSync");
  }
  if (input.behindOfOrigin === 0) {
    return i18n.t("workspace.git.actions.unavailable.pullAndPushNoIncoming");
  }
  if ((input.aheadOfOrigin ?? 0) === 0) {
    return i18n.t("workspace.git.actions.unavailable.pullAndPushNothingToPush");
  }
  return undefined;
}

function getCreatePrUnavailableMessage(input: BuildGitActionsInput): string | undefined {
  if (!input.githubFeaturesEnabled) {
    return i18n.t("workspace.git.actions.unavailable.createPrNoForge", {
      brand: input.forgeBrandLabel,
      noun: input.forgeChangeRequestNoun,
    });
  }
  if (input.aheadCount === 0 && !input.hasUncommittedChanges) {
    return i18n.t("workspace.git.actions.unavailable.createPrNoCommits");
  }
  return undefined;
}

function getMergeBranchUnavailableMessage(input: BuildGitActionsInput): string | undefined {
  if (!input.baseRefAvailable) {
    return i18n.t("workspace.git.actions.unavailable.mergeNoBase");
  }
  if (input.hasUncommittedChanges) {
    return i18n.t("workspace.git.actions.unavailable.mergeDirty");
  }
  if (input.aheadCount === 0) {
    return i18n.t("workspace.git.actions.unavailable.mergeNothing");
  }
  return undefined;
}

function getMergeFromBaseUnavailableMessage(input: BuildGitActionsInput): string | undefined {
  if (!input.baseRefAvailable) {
    return i18n.t("workspace.git.actions.unavailable.updateNoBase");
  }
  if (input.hasUncommittedChanges) {
    return i18n.t("workspace.git.actions.unavailable.updateDirty");
  }
  if (input.behindBaseCount === 0) {
    return i18n.t("workspace.git.actions.unavailable.updateCurrent", {
      baseRef: input.baseRefLabel,
    });
  }
  return undefined;
}

function getMergePrUnavailableMessage(input: BuildGitActionsInput): string | undefined {
  if (!input.githubFeaturesEnabled) {
    return i18n.t("workspace.git.actions.unavailable.mergePrNoForge", {
      brand: input.forgeBrandLabel,
      noun: input.forgeChangeRequestNoun,
    });
  }
  if (!input.hasPullRequest) {
    return i18n.t("workspace.git.actions.unavailable.mergePrMissing");
  }
  if (input.pullRequestIsDraft) {
    return i18n.t("workspace.git.actions.unavailable.mergePrDraft");
  }
  if (input.pullRequestIsMerged) {
    return i18n.t("workspace.git.actions.unavailable.mergePrMerged");
  }
  if (input.pullRequestState === "closed") {
    return i18n.t("workspace.git.actions.unavailable.mergePrClosed");
  }
  if (input.pullRequestMergeable === "CONFLICTING") {
    return i18n.t("workspace.git.actions.unavailable.mergePrConflicts");
  }
  if (input.mergeCapability === null) {
    return undefined;
  }
  if (input.mergeCapability.mergeBlockedByQueue) {
    return i18n.t("workspace.git.actions.unavailable.mergePrQueue");
  }
  if (!input.mergeCapability.directMergeReady) {
    return i18n.t("workspace.git.actions.unavailable.mergePrNotReady", {
      brand: input.forgeBrandLabel,
      noun: input.forgeChangeRequestNoun,
    });
  }
  return undefined;
}

function shouldDisableMergePrAction(input: BuildGitActionsInput): boolean {
  return !canMergePr(input);
}

function shouldShowPullRequestAction(
  input: BuildGitActionsInput,
  id: PullRequestActionId,
): boolean {
  if (id === "pr") {
    return true;
  }
  if (id === "disable-pr-auto-merge") {
    return input.githubAutoMergeActionsEnabled && input.mergeCapability?.autoMergeEnabled === true;
  }
  if (id === "merge-pr") {
    return canMergePr(input);
  }
  if (id === "enable-pr-auto-merge") {
    return canEnablePrAutoMerge(input);
  }
  return false;
}
