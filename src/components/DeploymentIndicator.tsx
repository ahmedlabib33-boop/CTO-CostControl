"use client";

import { useEffect, useRef, useState } from "react";

type DeploymentStatus = {
  ok: boolean;
  state: "pending" | "success" | "failure" | "error" | "unknown";
  latest_sha: string | null;
  deployed_sha: string | null;
  show_uploading: boolean;
  ready_to_reload: boolean;
  poll_after_ms: number;
};

const DEFAULT_POLL_MS = 10_000;
const ACTIVE_POLL_MS = 10_000;
const RELOAD_DELAY_MS = 2_500;
const RELOAD_THROTTLE_MS = 15_000;
export const DEPLOYMENT_STORAGE_KEY = "cto-deployment-in-progress-v1";

type PersistedDeployment = { sha: string; started_at: number };

function readPersistedDeployment(): PersistedDeployment | null {
  try {
    const value = JSON.parse(localStorage.getItem(DEPLOYMENT_STORAGE_KEY) || "null") as Partial<PersistedDeployment> | null;
    return value && typeof value.sha === "string" && value.sha ? { sha: value.sha, started_at: Number(value.started_at) || Date.now() } : null;
  } catch { return null; }
}

function persistDeployment(sha: string) {
  if (!sha) return;
  const existing = readPersistedDeployment();
  localStorage.setItem(DEPLOYMENT_STORAGE_KEY, JSON.stringify({ sha, started_at: existing?.sha === sha ? existing.started_at : Date.now() }));
  document.documentElement.classList.add("deployment-in-progress");
}

function clearPersistedDeployment() {
  localStorage.removeItem(DEPLOYMENT_STORAGE_KEY);
  document.documentElement.classList.remove("deployment-in-progress");
}

export default function DeploymentIndicator() {
  const [uploading, setUploading] = useState(false);
  const reloadTimer = useRef<number | null>(null);

  useEffect(() => {
    let stopped = false;
    let checking = false;
    let pollTimer: number | null = null;
    const setVisible = (value: boolean) => {
      setUploading(value);
      document.documentElement.classList.toggle("deployment-in-progress", value);
    };
    if (readPersistedDeployment()) setVisible(true);
    const pageDeploymentSha = String((window as Window & { __CTO_PAGE_DEPLOYMENT_SHA__?: string }).__CTO_PAGE_DEPLOYMENT_SHA__ || "");

    const scheduleReload = (sha: string) => {
      if (!sha || reloadTimer.current !== null) return;
      const key = `cto-deployment-reload-${sha}`;
      const lastAttempt = Number(sessionStorage.getItem(key) || 0);
      if (Date.now() - lastAttempt < RELOAD_THROTTLE_MS) return;
      sessionStorage.setItem(key, String(Date.now()));
      reloadTimer.current = window.setTimeout(() => window.location.reload(), RELOAD_DELAY_MS);
    };

    const check = async () => {
      if (stopped || checking) return;
      pollTimer = null;
      if (document.visibilityState !== "visible") {
        pollTimer = window.setTimeout(() => void check(), DEFAULT_POLL_MS);
        return;
      }
      checking = true;
      let nextPoll = DEFAULT_POLL_MS;
      try {
        const response = await fetch(`/api/deployment-status?t=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) return;
        const status = await response.json() as DeploymentStatus;
        if (Number.isFinite(status.poll_after_ms) && status.poll_after_ms >= 10_000) nextPoll = status.poll_after_ms;
        if (stopped || !status.ok) return;
        const pageIsOld = Boolean(
          pageDeploymentSha
          && status.latest_sha
          && pageDeploymentSha !== status.latest_sha
          && status.state === "success",
        );
        const shouldReload = Boolean(status.ready_to_reload || pageIsOld);
        if (status.show_uploading && status.latest_sha) {
          persistDeployment(status.latest_sha);
          setVisible(true);
          nextPoll = Math.min(nextPoll, ACTIVE_POLL_MS);
        } else if (shouldReload && status.latest_sha) {
          persistDeployment(status.latest_sha);
          setVisible(true);
          nextPoll = Math.min(nextPoll, ACTIVE_POLL_MS);
        } else if (status.state === "success" && status.latest_sha && status.deployed_sha === status.latest_sha) {
          clearPersistedDeployment();
          setVisible(false);
        } else if (status.state === "failure" || status.state === "error") {
          clearPersistedDeployment();
          setVisible(false);
        }
        if (shouldReload && status.latest_sha) scheduleReload(status.latest_sha);
      } catch {
        // A network/API failure must never create a false uploading state.
      } finally {
        checking = false;
        if (!stopped) pollTimer = window.setTimeout(() => void check(), nextPoll);
      }
    };

    const visible = () => {
      if (document.visibilityState !== "visible") return;
      if (pollTimer !== null) window.clearTimeout(pollTimer);
      pollTimer = null;
      void check();
    };
    const storageChanged = (event: StorageEvent) => {
      if (event.key !== DEPLOYMENT_STORAGE_KEY) return;
      setVisible(Boolean(readPersistedDeployment()));
    };
    void check();
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("storage", storageChanged);
    return () => {
      stopped = true;
      if (pollTimer !== null) window.clearTimeout(pollTimer);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("storage", storageChanged);
      if (reloadTimer.current !== null) window.clearTimeout(reloadTimer.current);
    };
  }, []);

  return (
    <div className={`deploymentUploading ${uploading ? "active" : ""}`} role="status" aria-live="polite" aria-label="Application update uploading">
      <span className="deploymentSpinner" aria-hidden="true" />
      <span>↑ uploading</span>
    </div>
  );
}
