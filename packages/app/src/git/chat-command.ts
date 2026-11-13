import type { GitActionId } from "./policy";
import {
  collectAllPanes,
  collectAllTabs,
  findPaneById,
  type WorkspaceLayout,
} from "@/stores/workspace-layout-actions";

export type GitChatAction = Exclude<GitActionId, "archive-workspace">;

export function currentGitChat(layout: WorkspaceLayout | undefined): string | null {
  if (!layout) return null;
  const tabs = collectAllTabs(layout.root);
  const focused = layout.focusedPaneId ? findPaneById(layout.root, layout.focusedPaneId) : null;
  const target = tabs.find((tab) => tab.tabId === focused?.focusedTabId)?.target;
  if (target?.kind === "agent") return target.agentId;
  // The Changes pane may have focus while the conversation remains visible alongside it.
  const visibleChats = collectAllPanes(layout.root)
    .filter((pane) => !pane.hidden)
    .flatMap((pane) => {
      const tab = tabs.find((entry) => entry.tabId === pane.focusedTabId);
      return tab?.target.kind === "agent" ? [tab.target.agentId] : [];
    });
  const candidates = [...new Set(visibleChats)];
  if (candidates.length === 1) return candidates[0];
  // A single chat can also live behind the Changes tab in the same pane.
  const chats = tabs.flatMap((tab) => (tab.target.kind === "agent" ? [tab.target.agentId] : []));
  return chats.length === 1 ? chats[0] : null;
}

export function buildGitChatCommand(input: {
  action: GitChatAction;
  cwd: string;
  branch: string | null;
  baseRef: string | null;
  pullRequestUrl: string | null;
  headSha: string | null;
}): string {
  let instruction: string;
  const action = input.action;
  switch (action) {
    case "merge-pr": {
      instruction = `Merge this pull request. Choose the merge method based on the repository's instructions, conventions and allowed methods. Refresh its state first. Verify that the checkout is clean, all local work is pushed, and the PR head matches the checkout and the revision below. Check required checks and reviews. Use an expected-head guard if the forge supports one. If the revision changed or merging is blocked, explain why and stop; do not bypass protections.`;
      break;
    }
    case "enable-pr-auto-merge": {
      instruction = `Enable auto-merge for this pull request after verifying the checkout and published revision match. Choose the merge method based on the repository's instructions, conventions and allowed methods. Respect required checks, reviews and the merge queue.`;
      break;
    }
    default: {
      const commands = {
        commit:
          "Review, commit and push all changes in this workspace. Follow the repository's commit conventions and run the required checks. If there is no remote, commit locally and explain that it has not been pushed.",
        pr: "Create a pull request for this workspace. Review all changes, run the required checks, commit and push as needed, then review the full branch diff against the base. Follow the repository's PR instructions and template. Use the configured forge and return the PR link. If a PR already exists for this branch, update it and return its link instead.",
        pull: "Pull the incoming changes for this workspace's tracked branch. Inspect the working tree first and preserve local work. Resolve conflicts with the context of this conversation, and report the result.",
        push: "Push this workspace's commits to its tracked remote, setting upstream if needed. Do not force-push. Report any blocker in this conversation.",
        "pull-and-push":
          "Synchronize this workspace with its tracked remote: pull incoming changes, resolve conflicts preserving local work, run relevant checks, and push. Do not force-push.",
        "merge-branch":
          "Merge this workspace's branch into the local base branch. Inspect both checkouts, preserve local work, and run the required checks. Report the resulting commit.",
        "merge-from-base":
          "Update this workspace from its configured base branch. Preserve local work, resolve conflicts using this conversation's context, and run relevant checks.",
        "disable-pr-auto-merge":
          "Disable auto-merge for this pull request and report its resulting state.",
        "continue-workspace":
          "Continue working in this workspace after the previous PR was merged. Inspect the checkout and preserve all local work. Fetch the base branch and create a fresh, uniquely named branch from its updated tip in this same workspace. Keep this conversation and its context. Do not reuse the merged branch or create a new agent. Report the new branch and wait for my next task.",
        "fix-pr":
          "Inspect this pull request's failed checks, merge conflicts and review feedback. Explain what needs attention in this conversation, fix the issues, run the relevant checks, then commit and push the fixes. Preserve unrelated work and do not bypass branch protections.",
      };
      instruction = commands[action];
    }
  }
  return `${instruction}\n\nWorkspace: ${JSON.stringify(input.cwd)}\nBranch: ${JSON.stringify(input.branch)}\nBase: ${JSON.stringify(input.baseRef)}${input.pullRequestUrl ? `\nPull request: ${input.pullRequestUrl}` : ""}${input.headSha ? `\nObserved checkout revision: ${input.headSha}` : ""}\n\nRe-check the current Git state before acting; these details may have changed while this message was queued. If the branch no longer matches, stop and explain. Keep progress and errors visible here.`;
}
