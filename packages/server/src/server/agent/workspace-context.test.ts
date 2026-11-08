import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureWorkspaceContextDir, workspaceContextInstructions } from "./workspace-context.js";

const roots: string[] = [];

function tempDir(prefix: string): string {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));
  roots.push(dir);
  return dir;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-c", "commit.gpgsign=false", ...args], {
    cwd,
    encoding: "utf8",
  });
}

function repo(): string {
  const dir = tempDir("paseo-context-repo-");
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "test@example.com");
  git(dir, "config", "user.name", "Test");
  writeFileSync(path.join(dir, "README.md"), "hello\n");
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", "init");
  return dir;
}

afterEach(() => {
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("ensureWorkspaceContextDir", () => {
  it("creates .context at the repository root and keeps it out of git", async () => {
    const dir = repo();
    const nested = path.join(dir, "src");
    execFileSync("mkdir", ["-p", nested]);

    const contextDir = await ensureWorkspaceContextDir(nested);

    expect(contextDir).toBe(path.join(dir, ".context"));
    expect(existsSync(path.join(dir, ".context"))).toBe(true);
    writeFileSync(path.join(dir, ".context", "plan.md"), "notes\n");
    expect(git(dir, "status", "--porcelain")).toBe("");
  });

  it("adds the exclude entry once", async () => {
    const dir = repo();

    await ensureWorkspaceContextDir(dir);
    await ensureWorkspaceContextDir(dir);

    const exclude = readFileSync(path.join(dir, ".git", "info", "exclude"), "utf8");
    expect(exclude.split("\n").filter((line) => line === "/.context/")).toHaveLength(1);
  });

  it("gives each worktree its own .context through the shared exclude file", async () => {
    const dir = repo();
    const worktree = path.join(tempDir("paseo-context-wt-"), "feature");
    git(dir, "worktree", "add", "-q", "-b", "feature", worktree);

    const contextDir = await ensureWorkspaceContextDir(worktree);

    expect(contextDir).toBe(path.join(worktree, ".context"));
    writeFileSync(path.join(worktree, ".context", "plan.md"), "notes\n");
    expect(git(worktree, "status", "--porcelain")).toBe("");
    expect(readFileSync(path.join(dir, ".git", "info", "exclude"), "utf8")).toContain("/.context/");
  });

  it("does nothing outside a git repository", async () => {
    const dir = tempDir("paseo-context-plain-");

    expect(await ensureWorkspaceContextDir(dir)).toBeNull();
    expect(existsSync(path.join(dir, ".context"))).toBe(false);
  });
});

describe("workspaceContextInstructions", () => {
  it("points agents at the directory", () => {
    expect(workspaceContextInstructions("/repo/.context")).toContain("`/repo/.context`");
  });
});
