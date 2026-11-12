import { test, expect } from "../support/fixtures";
import type { WSInboundMessage } from "@getpaseo/protocol/messages";
import { createTempGitRepo } from "../support/helpers/workspace";
import {
  connectWorkspaceSetupClient,
  setupCommandOutput,
  createWorkspaceThroughDaemon,
  openWorkspaceScriptsMenu,
  seedProjectForWorkspaceSetup,
  startWorkspaceScriptFromMenu,
  waitForWorkspaceSetupProgress,
  openProjectViaDaemon,
} from "../support/helpers/workspace-setup";
import {
  ensureExplorerSidebar,
  openFilesPanel,
  waitForWorkspaceTabsVisible,
} from "../support/helpers/workspace-tabs";
import { waitForTerminalContent } from "../support/helpers/terminal-perf";
import { daemonWsRoutePattern } from "../support/helpers/daemon-port";
import { getServerId } from "../support/helpers/server-id";
import { buildHostWorkspaceRoute } from "../../src/utils/host-routes";

async function sampleRunActivity(bar: import("@playwright/test").Locator): Promise<string[]> {
  return bar.evaluate(async (element) => {
    const transforms: string[] = [];
    for (let frame = 0; frame < 24; frame++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      transforms.push(getComputedStyle(element).transform);
    }
    return transforms;
  });
}

test("Explorer execution retries a failed script start and retains its session through collapse, resize and reload", async ({
  page,
}, testInfo) => {
  const client = await connectWorkspaceSetupClient();
  const repo = await createTempGitRepo("explorer-execution-", {
    paseoConfig: {
      scripts: {
        dev: {
          type: "script",
          command:
            "node -e \"console.log('EXECUTION_READY'); let n=0; setInterval(()=>console.log('EXECUTION_TICK '+ ++n),250)\"",
        },
        worker: {
          type: "script",
          command: "node -e \"console.log('WORKER_READY'); setInterval(()=>{},1000)\"",
        },
      },
    },
  });
  let failNext = true;
  await page.routeWebSocket(daemonWsRoutePattern(), (socket) => {
    const server = socket.connectToServer();
    socket.onMessage((message) => {
      if (typeof message === "string" && failNext) {
        const envelope: WSInboundMessage = JSON.parse(message);
        if (
          envelope.type === "session" &&
          envelope.message.type === "start_workspace_script_request"
        ) {
          failNext = false;
          const request = envelope.message;
          socket.send(
            JSON.stringify({
              type: "session",
              message: {
                type: "start_workspace_script_response",
                payload: {
                  requestId: request.requestId,
                  workspaceId: request.workspaceId,
                  scriptName: request.scriptName,
                  terminalId: null,
                  error: "Unable to start test script",
                },
              },
            }),
          );
          return;
        }
      }
      server.send(message);
    });
    server.onMessage((message) => socket.send(message));
  });
  try {
    await seedProjectForWorkspaceSetup(client, repo.path);
    const workspace = await openProjectViaDaemon(client, repo.path);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto(buildHostWorkspaceRoute(getServerId(), workspace.id));
    await waitForWorkspaceTabsVisible(page);
    await openFilesPanel(page);
    const explorer = await ensureExplorerSidebar(page);
    const body = explorer.getByTestId("explorer-execution-body");
    const run = explorer.getByTestId("explorer-execution-run");
    const activityBar = explorer.getByTestId("explorer-run-activity-bar-0");
    await expect(body).toBeHidden();
    await expect(activityBar).toHaveCount(0);
    await explorer.getByTestId("explorer-execution-run-view").click();
    await expect(body).toBeVisible();
    await run.click();
    await expect(page.getByText("Unable to start test script", { exact: true })).toBeVisible();
    await expect(run).toBeEnabled();
    await run.click();
    await waitForTerminalContent(page, (text) => text.includes("EXECUTION_READY"), 15_000);
    await expect(run).toHaveText("Stop");
    await expect(activityBar).toBeVisible();
    expect(new Set(await sampleRunActivity(activityBar)).size).toBeGreaterThan(1);
    await expect(explorer.getByTestId("file-explorer-tree-scroll")).toBeVisible();
    await expect(body.getByTestId("terminal-surface").filter({ visible: true })).toHaveCount(1);
    const terminals = await client.listTerminals(workspace.workspaceDirectory, undefined, {
      workspaceId: workspace.id,
    });
    expect(terminals.terminals).toHaveLength(1);
    const terminalId = terminals.terminals[0].id;
    const area = explorer.getByTestId("explorer-execution");
    const before = await area.boundingBox();
    const handle = explorer.getByTestId("explorer-execution-resize");
    const bounds = await handle.boundingBox();
    if (!before || !bounds) throw new Error("Execution resize geometry is unavailable");
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y - 100, { steps: 8 });
    await page.mouse.up();
    await expect
      .poll(async () => (await area.boundingBox())?.height ?? 0)
      .toBeGreaterThan(before.height + 60);
    const resized = await area.boundingBox();
    if (!resized) throw new Error("Resized execution area is unavailable");
    await explorer.getByTestId("explorer-execution-toggle").click();
    await expect(body).toBeHidden();
    await expect(activityBar).toBeVisible();
    expect(new Set(await sampleRunActivity(activityBar)).size).toBeGreaterThan(1);
    await page.reload();
    await expect(explorer.getByTestId("files-pane-header")).toBeVisible();
    await expect(body).toBeHidden();
    await explorer.getByTestId("explorer-execution-run-view").click();
    await waitForTerminalContent(
      page,
      (text) => text.includes("EXECUTION_READY") && text.includes("EXECUTION_TICK"),
      15_000,
    );
    await expect
      .poll(async () => (await area.boundingBox())?.height ?? 0)
      .toBeCloseTo(resized.height, 0);
    const restored = await client.listTerminals(workspace.workspaceDirectory, undefined, {
      workspaceId: workspace.id,
    });
    expect(restored.terminals.map((terminal) => terminal.id)).toEqual([terminalId]);
    await explorer.screenshot({ path: testInfo.outputPath("explorer-execution-light.png") });
    await page.emulateMedia({ colorScheme: "dark" });
    await explorer.screenshot({ path: testInfo.outputPath("explorer-execution-dark.png") });
    const header = explorer.getByTestId("explorer-execution-header");
    for (let frame = 0; frame < 24; frame++) {
      await header.screenshot({
        path: testInfo.outputPath(`run-activity-${String(frame).padStart(2, "0")}.png`),
        animations: "allow",
      });
    }
    await run.click();
    await expect(run).toHaveText("Run");
    await expect(activityBar).toHaveCount(0);
    await expect
      .poll(
        async () =>
          (
            await client.listTerminals(workspace.workspaceDirectory, undefined, {
              workspaceId: workspace.id,
            })
          ).terminals.length,
      )
      .toBe(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    await ensureExplorerSidebar(page);
    await expect(body).toBeVisible();
    await expect(run).toBeEnabled();
    await explorer.getByTestId("explorer-execution-script-picker").click();
    await page.getByTestId("explorer-execution-script-worker").click();
    await run.click();
    await waitForTerminalContent(page, (text) => text.includes("WORKER_READY"), 15_000);
    await expect(explorer.getByTestId("explorer-execution-script-picker")).toContainText("worker");
    await expect(activityBar).toBeVisible();
    expect(new Set(await sampleRunActivity(activityBar)).size).toBe(1);
    await run.click();
    await expect(run).toHaveText("Run");
  } finally {
    await client.close();
    await repo.cleanup();
  }
});

test("compact Explorer execution uses one surface and creates a reusable terminal", async ({
  page,
}) => {
  const client = await connectWorkspaceSetupClient();
  const repo = await createTempGitRepo("compact-explorer-execution-");
  try {
    const workspace = await openProjectViaDaemon(client, repo.path);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(buildHostWorkspaceRoute(getServerId(), workspace.id));
    const explorer = await ensureExplorerSidebar(page);
    await explorer.getByTestId("workspace-tab-files").click();
    await expect(explorer.getByTestId("files-pane-header")).toBeVisible();
    await explorer.getByTestId("explorer-execution-terminal-view").click();
    await expect(explorer.getByTestId("files-pane-header")).toBeHidden();
    await explorer.getByTestId("explorer-execution-create-terminal").click();
    await expect(explorer.getByTestId("terminal-surface").filter({ visible: true })).toHaveCount(1);
    await expect(explorer.getByRole("button", { name: "New tab", exact: true })).toHaveCount(1);
    await explorer.getByTestId("workspace-tab-files").click();
    await expect(explorer.getByTestId("files-pane-header")).toBeVisible();
    await expect(explorer.getByTestId("terminal-surface")).toBeHidden();
    await explorer.getByTestId("explorer-execution-terminal-view").click();
    await expect(explorer.getByTestId("terminal-surface").filter({ visible: true })).toHaveCount(1);
    const terminals = await client.listTerminals(workspace.workspaceDirectory, undefined, {
      workspaceId: workspace.id,
    });
    expect(terminals.terminals).toHaveLength(1);
  } finally {
    await client.close();
    await repo.cleanup();
  }
});

test("scripts menu resizes when a service row grows after launch", async ({ page }) => {
  const client = await connectWorkspaceSetupClient();
  const repo = await createTempGitRepo("script-menu-resize-", {
    paseoConfig: {
      worktree: {
        setup: ["sh -c 'echo setup complete'"],
      },
      scripts: {
        web: {
          type: "service",
          command:
            "node -e \"const http = require('http'); const s = http.createServer((q,r) => r.end('ok')); s.listen(process.env.PORT || 3000, () => console.log('listening on ' + s.address().port))\"",
        },
      },
    },
  });

  try {
    await seedProjectForWorkspaceSetup(client, repo.path);
    const completed = waitForWorkspaceSetupProgress(
      client,
      (payload) =>
        payload.status === "completed" &&
        setupCommandOutput(payload.detail).includes("setup complete"),
    );
    const workspace = await createWorkspaceThroughDaemon(client, {
      cwd: repo.path,
      worktreeSlug: `script-menu-resize-${Date.now()}`,
    });
    await completed;

    await page.goto(buildHostWorkspaceRoute(getServerId(), workspace.id));
    await waitForWorkspaceTabsVisible(page);
    await openWorkspaceScriptsMenu(page);

    const menu = page.getByTestId("workspace-scripts-menu");
    const before = await menu.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        height: rect.height,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
      };
    });

    await startWorkspaceScriptFromMenu(page, "web");
    await expect(menu).toContainText("localhost:", { timeout: 15_000 });

    const after = await menu.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const firstChild = element.firstElementChild;
      const childRect = firstChild?.getBoundingClientRect();
      return {
        height: rect.height,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        childHeight: childRect?.height ?? 0,
      };
    });

    expect(after.height).toBeGreaterThan(before.height);
    expect(after.scrollHeight).toBeLessThanOrEqual(after.clientHeight + 1);
    expect(after.childHeight).toBeGreaterThan(before.height);
  } finally {
    await client.close();
    await repo.cleanup();
  }
});
