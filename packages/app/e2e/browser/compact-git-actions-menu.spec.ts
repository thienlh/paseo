import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Locator, WebSocketRoute } from "@playwright/test";
import { test, expect, type Page } from "../support/fixtures";
import { getServerId } from "../support/helpers/server-id";
import { createMockIdleAgent } from "../support/helpers/archive-tab";
import { daemonWsRoutePattern } from "../support/helpers/daemon-port";
import { connectSeedClient, seedWorkspace } from "../support/helpers/seed-client";
import { createTempGitRepo, resolveTempRoot } from "../support/helpers/workspace";
import { buildHostWorkspaceRoute, buildHostAgentDetailRoute } from "../../src/utils/host-routes";

// The compact toolbar flattens every git action into one menu, and the policy keeps the actions
// it can promote to `primary` in `secondary` as well. A promoted action must still show once.
const cleanupTasks: Array<() => Promise<void>> = [];

test.afterEach(async () => {
  for (const task of cleanupTasks.splice(0)) {
    await task();
  }
});

async function createRemoteRepo(prefix: string): Promise<string> {
  const repo = await createTempGitRepo(prefix, {
    withRemote: true,
    files: [{ path: "src/app.ts", content: "export const app = 1;\n" }],
  });
  cleanupTasks.push(repo.cleanup);
  // The helper puts the bare remote inside the checkout; keep it out of the status.
  await writeFile(path.join(repo.path, ".git/info/exclude"), "remote.git/\n");
  return repo.path;
}

async function registerWorkspace(repoPath: string): Promise<string> {
  const client = await connectSeedClient();
  cleanupTasks.push(async () => {
    await client.close().catch(() => undefined);
  });
  const created = await client.createWorkspace({ source: { kind: "directory", path: repoPath } });
  if (!created.workspace) {
    throw new Error(created.error ?? `Failed to create workspace ${repoPath}`);
  }
  return created.workspace.id;
}

async function openCompactActionsMenu(page: Page, workspaceId: string) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(buildHostWorkspaceRoute(getServerId(), workspaceId));
  await page.reload();
  await page.getByTestId("workspace-explorer-toggle").first().click();
  const changesTab = page.getByTestId("workspace-tab-changes_tree").filter({ visible: true });
  await expect(changesTab).toBeVisible({ timeout: 30_000 });
  await changesTab.click();
  const explorer = page.getByTestId("workspace-explorer-sidebar").filter({ visible: true });
  await expect(explorer.getByTestId("changes-header")).toBeVisible({ timeout: 30_000 });

  const trigger = explorer.getByTestId("changes-actions-menu-trigger");
  await expect(trigger).toBeVisible({ timeout: 30_000 });
  await trigger.click();
  const menu = page.getByTestId("changes-primary-cta-menu");
  await expect(menu).toBeVisible();
  return menu;
}

async function expectActionsInOrder(menu: Locator, labels: readonly string[]) {
  const items = menu.getByRole("menuitem");
  await expect(items).toHaveCount(labels.length);
  for (const [index, label] of labels.entries()) {
    await expect(items.nth(index).getByText(label, { exact: true })).toBeVisible();
  }
}

test("compact git actions menu lists a promoted Pull once", async ({ page }) => {
  const repoPath = await createRemoteRepo("compact-menu-pull-");
  cleanupTasks.push(async () => {
    execFileSync("rm", ["-rf", repoPath]);
  });

  // Advance origin so the clean checkout is behind it and Pull is the promoted action.
  const other = await mkdtemp(path.join(await resolveTempRoot(), "compact-menu-other-"));
  cleanupTasks.push(async () => {
    execFileSync("rm", ["-rf", other]);
  });
  execFileSync("git", ["clone", path.join(repoPath, "remote.git"), other], { stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "e2e@paseo.test"], { cwd: other, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "Paseo E2E"], { cwd: other, stdio: "ignore" });
  await writeFile(path.join(other, "src/incoming.ts"), "export const incoming = 1;\n");
  execFileSync("git", ["add", "--all"], { cwd: other, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "Incoming commit"], { cwd: other, stdio: "ignore" });
  execFileSync("git", ["push", "origin", "main"], { cwd: other, stdio: "ignore" });
  execFileSync("git", ["fetch", "origin"], { cwd: repoPath, stdio: "ignore" });

  const workspaceId = await registerWorkspace(repoPath);
  const menu = await openCompactActionsMenu(page, workspaceId);

  await expect(menu.getByTestId("changes-menu-pull")).toHaveCount(1);
  await expectActionsInOrder(menu, ["Pull", "Push", "Pull and push", "Archive"]);
});

test("compact git actions menu lists a promoted Push once", async ({ page }) => {
  const repoPath = await createRemoteRepo("compact-menu-push-");
  cleanupTasks.push(async () => {
    execFileSync("rm", ["-rf", repoPath]);
  });
  const workspaceId = await registerWorkspace(repoPath);

  // Commit so the clean checkout is ahead of origin and Push is the promoted action.
  await writeFile(path.join(repoPath, "src/mine.ts"), "export const mine = 1;\n");
  execFileSync("git", ["add", "--all"], { cwd: repoPath, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "Local commit"], { cwd: repoPath, stdio: "ignore" });

  const menu = await openCompactActionsMenu(page, workspaceId);

  await expect(menu.getByTestId("changes-menu-push")).toHaveCount(1);
  await expectActionsInOrder(menu, ["Push", "Pull", "Pull and push", "Archive"]);
});

test("Git workflow sends Commit to the current chat and leaves Git state to the agent", async ({
  page,
}) => {
  const workspace = await seedWorkspace({ repoPrefix: "git-chat-flow-" });
  cleanupTasks.push(workspace.cleanup);
  const agent = await createMockIdleAgent(workspace.client, {
    cwd: workspace.repoPath,
    workspaceId: workspace.workspaceId,
    title: "Ship this change",
  });
  await writeFile(
    path.join(workspace.repoPath, "new-feature.txt"),
    "Keep this change in the current chat.\n",
  );
  await workspace.client.checkoutRefresh(workspace.repoPath);
  const before = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: workspace.repoPath,
    encoding: "utf8",
  });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(buildHostAgentDetailRoute(getServerId(), agent.id, workspace.workspaceId));
  await page.getByTestId("workspace-explorer-toggle").first().click();
  const action = page.getByTestId("changes-primary-cta").filter({ visible: true }).first();
  await expect(action).toHaveAccessibleName("Commit", { timeout: 30_000 });
  await action.click();
  await expect(
    page.getByTestId("user-message").filter({ hasText: "Review, commit and push all changes" }),
  ).toBeVisible({ timeout: 30_000 });
  expect(
    execFileSync("git", ["rev-parse", "HEAD"], { cwd: workspace.repoPath, encoding: "utf8" }),
  ).toBe(before);
  const agents = (await workspace.client.fetchAgents()).entries.filter(
    (entry) => entry.agent.workspaceId === workspace.workspaceId,
  );
  expect(agents.map((entry) => entry.agent.id)).toEqual([agent.id]);
  await page.screenshot({
    animations: "disabled",
    path: path.resolve(__dirname, "../../../../.context/git-workflow-chat.png"),
  });
});

test("Git actions keep the original split controls in the Explorer header", async ({ page }) => {
  const workspace = await seedWorkspace({ repoPrefix: "git-state-cues-" });
  cleanupTasks.push(workspace.cleanup);
  const agent = await createMockIdleAgent(workspace.client, {
    cwd: workspace.repoPath,
    workspaceId: workspace.workspaceId,
    title: "Merge this change",
  });
  execFileSync("git", ["checkout", "-b", "feature"], { cwd: workspace.repoPath });
  const headSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: workspace.repoPath,
    encoding: "utf8",
  }).trim();
  let stage: "open" | "waiting" | "attention" | "ready" | "merged" = "waiting";
  function pullRequest() {
    return {
      forge: "github",
      url: "https://github.com/example/repo/pull/1",
      number: 1,
      title: "Ship the current change",
      state: stage === "merged" ? "closed" : "open",
      headRefName: "feature",
      baseRefName: "main",
      headSha,
      isMerged: stage === "merged",
      isDraft: false,
      mergeable: "MERGEABLE",
      checks: [],
      checksStatus: stage === "waiting" ? "pending" : "success",
      reviewDecision: stage === "attention" ? "changes_requested" : "approved",
      forgeSpecific: {
        forge: "github",
        mergeStateStatus: stage === "ready" ? "CLEAN" : "BLOCKED",
        autoMergeRequest: null,
        viewerCanEnableAutoMerge: false,
        viewerCanDisableAutoMerge: false,
        viewerCanMergeAsAdmin: false,
        viewerCanUpdateBranch: false,
        repository: {
          autoMergeAllowed: false,
          mergeCommitAllowed: true,
          squashMergeAllowed: true,
          rebaseMergeAllowed: true,
          viewerDefaultMergeMethod: "SQUASH",
        },
        isMergeQueueEnabled: false,
        isInMergeQueue: false,
      },
    };
  }
  const git = {
    headSha,
    currentBranch: "feature",
    isDirty: false,
    aheadOfOrigin: 0,
    behindOfOrigin: 0,
    aheadBehind: { ahead: 1, behind: 0 },
    isPaseoOwnedWorktree: true,
  };
  let liveSocket: WebSocketRoute | undefined;
  const checkoutEventRequests = new Set<string>();
  let eventSubscriptionId: string | undefined;
  let workspaceSubscriptionId: string | undefined;
  let checkoutSnapshot: Record<string, unknown> | undefined;
  let workspaceSnapshot: Record<string, unknown> | undefined;
  // Forge facts are controlled fixtures. The app, daemon, status transport and DOM are real.
  function projectFixture(value: unknown): void {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(projectFixture);
      return;
    }
    const node = value as Record<string, unknown>;
    if (node.cwd === workspace.repoPath && node.isGit === true) {
      if ("repoRoot" in node && "requestId" in node) checkoutSnapshot = node;
      Object.assign(node, git, {
        hasRemote: true,
        remoteUrl: "https://github.com/example/repo.git",
        mainRepoRoot: workspace.repoPath,
        baseRef: "refs/remotes/origin/main",
        baseRefExact: "refs/remotes/origin/main",
      });
    }
    if (node.cwd === workspace.repoPath && "githubFeaturesEnabled" in node && "status" in node)
      Object.assign(node, {
        status: pullRequest(),
        githubFeaturesEnabled: true,
        forge: "github",
        error: null,
      });
    if (node.workspaceDirectory === workspace.repoPath) {
      workspaceSnapshot = node;
      Object.assign(node, {
        gitRuntime: git,
        githubRuntime: { featuresEnabled: true, pullRequest: pullRequest(), error: null },
      });
    }
    Object.values(node).forEach(projectFixture);
  }
  await page.routeWebSocket(daemonWsRoutePattern(), (browser) => {
    liveSocket = browser;
    const server = browser.connectToServer();
    browser.onMessage((frame) => {
      if (typeof frame === "string") {
        const { message } = JSON.parse(frame);
        if (
          message?.type === "session.events.set_subscription.request" &&
          message.events.includes("checkout_status_update")
        )
          checkoutEventRequests.add(message.requestId);
      }
      server.send(frame);
    });
    server.onMessage((frame) => {
      if (typeof frame !== "string") {
        browser.send(frame);
        return;
      }
      const envelope = JSON.parse(frame);
      const message = envelope.message;
      if (
        message?.type === "session.events.set_subscription.response" &&
        checkoutEventRequests.has(message.payload.requestId)
      )
        eventSubscriptionId = message.payload.subscriptionId;
      if (message?.type === "fetch_workspaces_response" && message.payload.subscriptionId)
        workspaceSubscriptionId = message.payload.subscriptionId;
      projectFixture(envelope);
      browser.send(JSON.stringify(envelope));
    });
  });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(buildHostAgentDetailRoute(getServerId(), agent.id, workspace.workspaceId));
  await page.getByTestId("workspace-explorer-toggle").first().click();
  const bar = page.getByTestId("git-workflow-bar").filter({ visible: true });
  await expect(bar).toBeVisible();
  await expect(bar.getByTestId("changes-primary-cta-caret")).toBeVisible();
  await expect(page.getByTestId("changes-primary-cta")).toHaveCount(1);
  const mainHeader = page.getByTestId("composer-dock-header").filter({ visible: true }).first();
  const explorer = page.getByTestId("workspace-explorer-sidebar").filter({ visible: true });
  await expect(mainHeader.getByTestId("workspace-explorer-toggle")).toBeVisible();
  await expect(explorer.getByTestId("workspace-explorer-toggle")).toHaveCount(0);
  await expect(
    page.getByTestId("git-workflow-status").filter({ visible: true }).first(),
  ).toBeVisible();
  for (const step of [
    { state: "open", label: "In review", action: "View PR" },
    { state: "waiting", label: "Checks pending", action: "View PR" },
    { state: "attention", label: "Needs attention", action: "Fix PR" },
    { state: "ready", label: "Ready to merge", action: "Merge PR" },
    { state: "merged", label: "Merged", action: "Archive" },
  ] as const) {
    if (
      !liveSocket ||
      !checkoutSnapshot ||
      !workspaceSnapshot ||
      !eventSubscriptionId ||
      !workspaceSubscriptionId
    ) {
      throw new Error("Workflow fixture did not capture the active subscriptions and snapshots");
    }
    await expect(page.getByTestId("workspace-open-in-editor-primary")).toBeVisible();
    stage = step.state;
    projectFixture(checkoutSnapshot);
    projectFixture(workspaceSnapshot);
    liveSocket.send(
      JSON.stringify({
        type: "session",
        message: {
          type: "checkout_status_update",
          payload: {
            ...checkoutSnapshot,
            subscriptionId: eventSubscriptionId,
            prStatus: {
              cwd: workspace.repoPath,
              status: pullRequest(),
              githubFeaturesEnabled: true,
              forge: "github",
              error: null,
              requestId: `fixture-${stage}`,
            },
          },
        },
      }),
    );
    liveSocket.send(
      JSON.stringify({
        type: "session",
        message: {
          type: "workspace_update",
          payload: {
            kind: "upsert",
            subscriptionId: workspaceSubscriptionId,
            workspace: workspaceSnapshot,
          },
        },
      }),
    );
    if (step.state === "ready" || step.state === "open") {
      await expect(page.getByTestId("git-workflow-status")).toHaveCount(0);
    } else {
      await expect(bar.getByTestId("git-workflow-status")).toHaveText(step.label, {
        timeout: 30_000,
      });
    }
    await expect(
      page.getByTestId("changes-primary-cta").filter({ visible: true }).first(),
    ).toHaveAccessibleName(step.action);
    const headerIcon = mainHeader.getByTestId("workspace-header-icon");
    await expect(headerIcon).toHaveText("G");
    const sidebarIcon = page.getByTestId("project-icon-only").getByText("G", { exact: true });
    const sidebarIconColor = await sidebarIcon
      .locator("..")
      .evaluate((element) => getComputedStyle(element).backgroundColor);
    await expect(headerIcon.getByText("G", { exact: true }).locator("..")).toHaveCSS(
      "background-color",
      sidebarIconColor,
    );
    const barBox = await bar.boundingBox();
    const mainHeaderBox = await mainHeader.boundingBox();
    const tabBox = await page
      .getByTestId("workspace-tab-changes_tree")
      .filter({ visible: true })
      .boundingBox();
    expect(barBox).not.toBeNull();
    expect(mainHeaderBox).not.toBeNull();
    expect(barBox!.y).toBeCloseTo(mainHeaderBox!.y, 0);
    expect(barBox!.height).toBeCloseTo(mainHeaderBox!.height, 0);
    expect(tabBox).not.toBeNull();
    expect(barBox!.y + barBox!.height).toBeLessThanOrEqual(tabBox!.y + 1);
    await expect(bar).toHaveCSS("box-shadow", "none");
    if (step.state === "merged") {
      await expect(bar.getByTestId("checks-review-start")).toHaveCount(0);
    } else {
      await expect(bar.getByTestId("checks-review-start")).toBeVisible();
      const reviewBox = await bar.getByTestId("checks-review-start").boundingBox();
      const mergeBox = await bar.getByTestId("changes-primary-cta").locator("..").boundingBox();
      expect(reviewBox).not.toBeNull();
      expect(mergeBox).not.toBeNull();
      expect(reviewBox!.y).toBeCloseTo(mergeBox!.y, 0);
      expect(reviewBox!.height).toBeCloseTo(mergeBox!.height, 0);
      expect(reviewBox!.x + reviewBox!.width).toBeLessThanOrEqual(mergeBox!.x);
      expect(reviewBox!.x).toBeGreaterThanOrEqual(barBox!.x);
    }
    // Sample past Reanimated's delayed custom-animation cleanup (500ms). Text visibility
    // alone misses a badge pulled out of flex layout and painted over the editor button.
    const overlaps = await page.evaluate(async () => {
      const failures = new Set<string>();
      const started = performance.now();
      do {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const status = document.querySelector('[data-testid="git-workflow-status"]');
        if (!status) continue;
        const content = document.createRange();
        content.selectNodeContents(status);
        const badge = content.getBoundingClientRect();
        const row = document
          .querySelector('[data-testid="git-workflow-bar"]')!
          .getBoundingClientRect();
        if (badge.left < row.left - 1 || badge.right > row.right + 1) {
          failures.add("Status badge escaped its toolbar layout");
        }
        for (const id of [
          "workspace-open-in-editor-primary",
          "workspace-open-in-editor-caret",
          "changes-primary-cta",
          "changes-primary-cta-caret",
          "changes-continue-cta",
          "checks-review-start",
        ]) {
          const control = document.querySelector(`[data-testid="${id}"]`);
          if (!control) continue;
          const rect = control.getBoundingClientRect();
          if (
            badge.left < rect.right &&
            badge.right > rect.left &&
            badge.top < rect.bottom &&
            badge.bottom > rect.top
          )
            failures.add(`Status badge overlaps ${id}`);
        }
      } while (performance.now() - started < 750);
      return [...failures];
    });
    await page.screenshot({
      path: path.resolve(__dirname, `../../../../.context/git-workflow-live-${step.state}.png`),
    });
    expect(overlaps).toEqual([]);
    if (step.state === "ready") {
      await bar.getByTestId("changes-primary-cta-caret").click();
      const menu = page.getByTestId("changes-primary-cta-menu");
      await expect(menu.getByRole("menuitem").filter({ hasText: "Merge PR" })).toHaveCount(1);
      await expect(menu.getByText("Merge PR", { exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      await page.getByTestId("changes-primary-cta").click();
      await expect(
        page.getByTestId("user-message").filter({ hasText: "Choose the merge method" }),
      ).toBeVisible();
    }
  }
  await expect(page.getByTestId("changes-continue-cta").first()).toBeVisible();
  await page.evaluate(() => {
    const current = JSON.parse(localStorage.getItem("@paseo:app-settings") ?? "{}");
    localStorage.setItem("@paseo:app-settings", JSON.stringify({ ...current, theme: "pureBlack" }));
  });
  await page.reload();
  await expect(page.getByTestId("changes-continue-cta").first()).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: path.resolve(__dirname, "../../../../.context/git-workflow-merged-dark.png"),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByTestId("workspace-explorer-toggle").first().click();
  const changesTab = page.getByTestId("workspace-tab-changes_tree").filter({ visible: true });
  await changesTab.click();
  const menuTrigger = page.getByTestId("changes-actions-menu-trigger").filter({ visible: true });
  await menuTrigger.click();
  const compactMenu = page.getByTestId("changes-primary-cta-menu");
  await expect(compactMenu.getByText("Continue", { exact: true })).toBeVisible();
  await expect(compactMenu.getByText("Archive", { exact: true })).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: path.resolve(__dirname, "../../../../.context/git-workflow-compact.png"),
  });
});
