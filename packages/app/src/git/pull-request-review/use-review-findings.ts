import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { useFetchQuery } from "@/data/query";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import {
  parseReviewFindings,
  REVIEW_FINDINGS_DIR,
  reviewFindingsProvider,
  type ReviewFinding,
} from "./findings";

// A review writes its file when it finishes; poll while the Checks panel shows.
const REFRESH_INTERVAL_MS = 5000;

export interface LatestReviewFindings {
  /** The file name, which starts with the time the review started. */
  fileName: string;
  /** The provider that ran the review, when it is known. */
  provider: string | null;
  findings: ReviewFinding[];
  invalidCount: number;
  /** The file exists but is not a JSON array, for example while the agent is writing it. */
  unreadable: boolean;
}

type FindingsClient = Pick<DaemonClient, "listDirectory" | "readFile">;

/** Reads the newest review's findings from the workspace's `.context/reviews`. */
export async function readLatestReviewFindings(
  client: FindingsClient,
  cwd: string,
): Promise<LatestReviewFindings | null> {
  let entries;
  try {
    entries = (await client.listDirectory(cwd, REVIEW_FINDINGS_DIR)).entries;
  } catch {
    // No review has saved findings in this workspace yet.
    return null;
  }
  const latest = entries
    .filter((entry) => entry.kind === "file" && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort()
    .at(-1);
  if (!latest) {
    return null;
  }
  const file = await client.readFile(cwd, `${REVIEW_FINDINGS_DIR}/${latest}`);
  const parsed = parseReviewFindings(new TextDecoder().decode(file.bytes));
  return {
    fileName: latest,
    provider: reviewFindingsProvider(latest),
    findings: parsed?.findings ?? [],
    invalidCount: parsed?.invalidCount ?? 0,
    unreadable: parsed === null,
  };
}

export function useLatestReviewFindings(input: { serverId: string; cwd: string }) {
  const client = useHostRuntimeClient(input.serverId);
  return useFetchQuery({
    queryKey: ["latestReviewFindings", input.serverId, input.cwd],
    queryFn: () => {
      if (!client) throw new Error("Host disconnected");
      return readLatestReviewFindings(client, input.cwd);
    },
    dataShape: "value",
    staleTimeMs: REFRESH_INTERVAL_MS,
    enabled: Boolean(client && input.cwd),
    refetchInterval: REFRESH_INTERVAL_MS,
  });
}
