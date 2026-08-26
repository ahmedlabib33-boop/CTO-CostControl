from __future__ import annotations

import json
import os
import subprocess
import time
import urllib.request
from pathlib import Path


def run(cmd: list[str], cwd: Path, check: bool = True) -> subprocess.CompletedProcess:
    print("$", " ".join(cmd))
    return subprocess.run(cmd, cwd=cwd, check=check, text=True)


def publish(repo_root: Path, expected_fingerprint: str) -> None:
    run(["python", "-m", "unittest", "discover", "-s", "tests", "-v"], repo_root)
    run(["python", "-m", "watcher.validate_all", "--root", str(repo_root)], repo_root)
    run(["npm", "run", "build"], repo_root)
    run(["git", "add", "public/generated"], repo_root)
    status = subprocess.run(["git", "status", "--porcelain"], cwd=repo_root, capture_output=True, text=True, check=True).stdout.strip()
    if status:
        run(["git", "commit", "-m", "chore(data): publish validated cost-control update"], repo_root)
        run(["git", "push", "origin", "HEAD:main"], repo_root)
    else:
        print("No generated data changes to publish.")
    url = os.environ.get("CTO_VERCEL_URL", "").rstrip("/")
    if url:
        verify_vercel(url, expected_fingerprint)


def verify_vercel(base_url: str, expected_fingerprint: str, attempts: int = 24, sleep_seconds: int = 10) -> None:
    health = f"{base_url}/api/health"
    last = ""
    for _ in range(attempts):
        try:
            with urllib.request.urlopen(health, timeout=10) as r:
                payload = json.load(r)
            last = payload.get("registry_fingerprint", "")
            if last == expected_fingerprint:
                print(f"VERCEL VERIFIED fingerprint={last}")
                return
        except Exception as exc:
            last = f"error:{exc}"
        time.sleep(sleep_seconds)
    raise RuntimeError(f"Vercel verification failed; expected {expected_fingerprint}, last={last}")
