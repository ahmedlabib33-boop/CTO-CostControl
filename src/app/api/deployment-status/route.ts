import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type VercelState = "pending" | "success" | "failure" | "error" | "unknown";
type CommitStatus = {
  context?: unknown;
  state?: unknown;
  updated_at?: unknown;
};

const allowedStates = new Set<VercelState>(["pending", "success", "failure", "error"]);

function unknownResponse(error?: string) {
  return NextResponse.json(
    {
      ok: false,
      state: "unknown" as VercelState,
      latest_sha: null,
      deployed_sha: process.env.VERCEL_GIT_COMMIT_SHA || null,
      show_uploading: false,
      ready_to_reload: false,
      checked_at: new Date().toISOString(),
      ...(error ? { error } : {}),
    },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}

export async function GET() {
  const owner = process.env.VERCEL_GIT_REPO_OWNER || "ahmedlabib33-boop";
  const repo = process.env.VERCEL_GIT_REPO_SLUG || "CTO-CostControl";
  const ref = process.env.VERCEL_GIT_COMMIT_REF || "main";
  const deployedSha = process.env.VERCEL_GIT_COMMIT_SHA || "";
  const token = process.env.GITHUB_STATUS_TOKEN?.trim();
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "CTO-CostControl-deployment-status",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(ref)}/status`,
      { headers, next: { revalidate: 8 } },
    );
    if (!response.ok) return unknownResponse(`github_status_${response.status}`);

    const payload = await response.json() as { sha?: unknown; statuses?: unknown };
    const latestSha = typeof payload.sha === "string" ? payload.sha : "";
    const statuses = Array.isArray(payload.statuses) ? payload.statuses as CommitStatus[] : [];
    const vercel = statuses
      .filter(status => String(status.context || "").trim().toLowerCase() === "vercel")
      .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))[0];
    const rawState = String(vercel?.state || "").toLowerCase();
    const state: VercelState = allowedStates.has(rawState as VercelState) ? rawState as VercelState : "unknown";
    const isNewerCommit = Boolean(latestSha && deployedSha && latestSha !== deployedSha);

    return NextResponse.json(
      {
        ok: state !== "unknown",
        state,
        latest_sha: latestSha || null,
        deployed_sha: deployedSha || null,
        show_uploading: state === "pending",
        ready_to_reload: state === "success" && isNewerCommit,
        checked_at: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch {
    return unknownResponse("github_status_unavailable");
  }
}

