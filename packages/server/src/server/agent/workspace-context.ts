import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createRunGitCommand, type RunGitCommand } from "../../utils/run-git-command.js";

const CONTEXT_DIRNAME = ".context";
const EXCLUDE_PATTERN = `/${CONTEXT_DIRNAME}/`;
const EQUIVALENT_PATTERNS = new Set([
  EXCLUDE_PATTERN,
  `/${CONTEXT_DIRNAME}`,
  `${CONTEXT_DIRNAME}/`,
  CONTEXT_DIRNAME,
]);

const defaultRunGit = createRunGitCommand("workspace-context");

/**
 * Makes sure the workspace's repository root has a `.context` directory that git ignores, a place
 * for agents and the user to share files in that workspace. It is excluded through the
 * repository's shared `info/exclude`, which covers every worktree, so no project has to change its
 * `.gitignore`. Returns the directory, or null when `cwd` is not inside a git work tree.
 */
export async function ensureWorkspaceContextDir(
  cwd: string,
  runGit: RunGitCommand = defaultRunGit,
): Promise<string | null> {
  const result = await runGit(["rev-parse", "--show-toplevel", "--git-common-dir"], {
    cwd,
    acceptExitCodes: [0, 128],
  });
  if (result.exitCode !== 0) {
    return null;
  }
  const [toplevel, commonDir] = result.stdout.trim().split("\n");
  if (!toplevel || !commonDir) {
    return null;
  }
  const contextDir = path.join(toplevel, CONTEXT_DIRNAME);
  await mkdir(contextDir, { recursive: true });
  // `--git-common-dir` may be relative to the directory git ran in.
  await excludeFromGit(path.join(path.resolve(cwd, commonDir), "info", "exclude"));
  return contextDir;
}

async function excludeFromGit(excludePath: string): Promise<void> {
  let current = "";
  try {
    current = await readFile(excludePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (current.split(/\r?\n/).some((line) => EQUIVALENT_PATTERNS.has(line.trim()))) {
    return;
  }
  await mkdir(path.dirname(excludePath), { recursive: true });
  const separator = current.length > 0 && !current.endsWith("\n") ? "\n" : "";
  await appendFile(excludePath, `${separator}${EXCLUDE_PATTERN}\n`);
}

export function workspaceContextInstructions(contextDir: string): string {
  return `This workspace has a \`.context\` directory at \`${contextDir}\` that git ignores. Save files there that you want to share with the user or with other agents in this workspace, such as plans, notes, and screenshots.`;
}
