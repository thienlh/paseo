import { deriveMergeCapability } from "./merge-capability";

export type GitWorkflowState =
  | "local"
  | "open"
  | "waiting"
  | "attention"
  | "ready"
  | "merged"
  | "closed";

export interface WorkflowCheckout {
  headSha?: string | null;
  currentBranch?: string | null;
  isDirty?: boolean | null;
  aheadOfOrigin?: number | null;
  behindOfOrigin?: number | null;
}

export interface WorkflowPullRequest {
  headSha?: string | null;
  headRefName?: string;
  state?: string;
  isMerged?: boolean;
  isDraft?: boolean;
  mergeable?: string;
  checksStatus?: string;
  reviewDecision?: string | null;
  forgeSpecific?: unknown;
}

export function isCheckoutShipped(
  git: WorkflowCheckout | null,
  pr: WorkflowPullRequest | null,
): boolean {
  // A branch name can be reused. Only the exact published revision earns Archive.
  return Boolean(
    git &&
    pr?.isMerged &&
    git.headSha &&
    git.headSha === pr.headSha &&
    git.currentBranch === pr.headRefName &&
    git.isDirty === false &&
    (git.aheadOfOrigin === 0 || git.aheadOfOrigin === null) &&
    (git.behindOfOrigin === 0 || git.behindOfOrigin === null),
  );
}

// A pure projection of observed facts. Chat submissions never advance this state.
export function deriveGitWorkflowState(
  git: WorkflowCheckout | null,
  pr: WorkflowPullRequest | null,
): GitWorkflowState {
  if (!pr || !matchesBranch(git, pr)) return "local";
  if (pr.isMerged) return isCheckoutShipped(git, pr) ? "merged" : "local";
  if (pr.state === "closed") return "closed";
  if (
    pr.mergeable === "CONFLICTING" ||
    pr.checksStatus === "failure" ||
    pr.reviewDecision === "changes_requested"
  )
    return "attention";
  if (hasUnpublishedWork(git)) return "open";
  if (pr.isDraft) return "open";
  const capability = deriveMergeCapability(pr.forgeSpecific);
  if (
    pr.checksStatus === "pending" ||
    capability?.autoMergeEnabled ||
    capability?.mergeBlockedByQueue
  )
    return "waiting";
  if (capability?.directMergeReady && matchesRevision(git, pr)) return "ready";
  return "open";
}

function hasUnpublishedWork(git: WorkflowCheckout | null): boolean {
  return Boolean(git?.isDirty || (git?.aheadOfOrigin ?? 0) > 0 || (git?.behindOfOrigin ?? 0) > 0);
}

function matchesBranch(git: WorkflowCheckout | null, pr: WorkflowPullRequest): boolean {
  return Boolean(git?.currentBranch && git.currentBranch === pr.headRefName);
}

function matchesRevision(git: WorkflowCheckout | null, pr: WorkflowPullRequest): boolean {
  return Boolean(git?.headSha && git.headSha === pr.headSha);
}
