"use client";

import { useEffect, useRef, useState } from "react";

type DeploymentStatus = {
  ok: boolean;
  state: "pending" | "success" | "failure" | "error" | "unknown";
  latest_sha: string | null;
  deployed_sha: string | null;
  show_uploading: boolean;
  ready_to_reload: boolean;
};

const PAGE_DEPLOYMENT_SHA = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || "";
const POLL_MS = 10_000;
const RELOAD_DELAY_MS = 2_500;
const RELOAD_THROTTLE_MS = 15_000;

export default function DeploymentIndicator() {
  const [uploading, setUploading] = useState(false);
  const reloadTimer = useRef<number | null>(null);

  useEffect(() => {
    let stopped = false;

    const scheduleReload = (sha: string) => {
      if (!sha || reloadTimer.current !== null) return;
      const key = `cto-deployment-reload-${sha}`;
      const lastAttempt = Number(sessionStorage.getItem(key) || 0);
      if (Date.now() - lastAttempt < RELOAD_THROTTLE_MS) return;
      sessionStorage.setItem(key, String(Date.now()));
      reloadTimer.current = window.setTimeout(() => window.location.reload(), RELOAD_DELAY_MS);
    };

    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch(`/api/deployment-status?t=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) return;
        const status = await response.json() as DeploymentStatus;
        if (stopped || !status.ok) {
          if (!stopped && status.state !== "pending") setUploading(false);
          return;
        }
        const pageIsOld = Boolean(
          PAGE_DEPLOYMENT_SHA
          && status.latest_sha
          && PAGE_DEPLOYMENT_SHA !== status.latest_sha
          && status.state === "success",
        );
        const shouldReload = Boolean(status.ready_to_reload || pageIsOld);
        setUploading(Boolean(status.show_uploading || shouldReload));
        if (shouldReload && status.latest_sha) scheduleReload(status.latest_sha);
      } catch {
        // A network/API failure must never create a false uploading state.
      }
    };

    const visible = () => { if (document.visibilityState === "visible") void check(); };
    void check();
    const interval = window.setInterval(() => void check(), POLL_MS);
    document.addEventListener("visibilitychange", visible);
    return () => {
      stopped = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", visible);
      if (reloadTimer.current !== null) window.clearTimeout(reloadTimer.current);
    };
  }, []);

  if (!uploading) return null;
  return (
    <div className="deploymentUploading" role="status" aria-live="polite" aria-label="Application update uploading">
      <span className="deploymentSpinner" aria-hidden="true" />
      <span>↑ uploading</span>
    </div>
  );
}

