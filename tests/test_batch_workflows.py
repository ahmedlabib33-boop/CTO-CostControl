import builtins
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]


def load_crup_payload(root: Path):
    raw = (ROOT / "CrUp_JSON.bat").read_text(encoding="utf-8")
    marker = "# PYTHON-PAYLOAD-START"
    code = raw[raw.rfind(marker) + len(marker):]
    module_name = "crup_json_test"
    module = types.ModuleType(module_name)
    module.__file__ = str(ROOT / "CrUp_JSON.bat")
    sys.modules[module_name] = module
    original_argv = sys.argv
    try:
        sys.argv = [str(ROOT / "CrUp_JSON.bat"), str(root)]
        exec(compile(code, str(ROOT / "CrUp_JSON.bat"), "exec"), module.__dict__)
    finally:
        sys.argv = original_argv
        sys.modules.pop(module_name, None)
    return module.__dict__


class BatchWorkflowTests(unittest.TestCase):
    def test_publisher_uses_changed_only_hash_plan_and_never_implicitly_deletes(self):
        bat = (ROOT / "powershell.bat").read_text(encoding="utf-8")
        script = (ROOT / "tools/publish_generated_delta.ps1").read_text(encoding="utf-8")
        self.assertIn("publish_generated_delta.ps1", bat)
        self.assertIn('-RepoRoot "%~dp0."', bat)
        self.assertNotIn('-RepoRoot "%~dp0"', bat)
        self.assertIn("Get-GitBlobSha", script)
        self.assertIn("Get-DeltaPlan", script)
        self.assertIn("NO CHANGES", script)
        self.assertIn("Remote-only files are intentionally preserved", script)
        self.assertNotIn("Removing old remote file", script)
        self.assertIn("MirrorGenerated", script)
        self.assertIn("Deletion scope is explicit", script)
        self.assertIn("if ($MirrorGenerated)", script)
        self.assertIn("DeleteProjectId", script)
        self.assertIn("DeletePeriod", script)
        self.assertIn("git add -u -- @deletePaths", script)
        self.assertIn("-Deletions @($deletions)", script)
        self.assertNotIn("Native generated-data publishing does not delete remote files", script)
        self.assertIn("SecurityProtocolType]::Tls12", script)
        self.assertIn("Temporary GitHub connection failure", script)
        self.assertIn("No branch commit was created", script)
        self.assertIn("$arguments.TimeoutSec = 120", script)
        self.assertIn("GitHub main moved", script)
        self.assertIn("force = $false", script)
        self.assertIn('Read-Host "Paste GITHUB_TOKEN (input is hidden)" -AsSecureString', script)
        self.assertIn("Nothing was committed", script)
        self.assertIn('.runtime\\github-token.txt', script)
        self.assertIn('http.version=HTTP/1.1', script)
        self.assertIn('x-access-token:$token', script)
        self.assertIn('Temporary GitHub push failure', script)

    def test_clean_preflights_authorization_and_rolls_back_failed_publish(self):
        script = (ROOT / "Clean_Vercel.bat").read_text(encoding="utf-8")
        self.assertIn("function Assert-GitHubAuthorization", script)
        self.assertIn("function Backup-CleanTransaction", script)
        self.assertIn("function Restore-CleanTransaction", script)
        self.assertIn("NOTHING WAS DELETED", script)
        self.assertIn('.runtime\\github-token.txt', script)
        self.assertIn('$registry | ForEach-Object { $_ }', script)
        self.assertIn('-MirrorGenerated', script)
        self.assertIn('-DeleteProjectId', script)
        self.assertIn('-DeletePeriod', script)
        self.assertNotIn('[IO.File]::ReadAllBytes($file.FullName)', script)
        self.assertIn('function Regenerate-GlobalIndexes', script)
        self.assertIn('Rollback could not verify restored INPUT file', script)
        self.assertIn('$restoredInputFiles INPUT source file(s) were restored and verified', script)
        self.assertIn('$publisherOutput', script)
        self.assertIn('Changed-only GitHub publisher failed with exit code', script)
        self.assertIn('from watcher.xlsx_engine import regenerate_portfolio', script)
        remove_project_start = script.index('function Remove-OneProject')
        remove_project_end = script.index('\nfunction Remove-AllProjects', remove_project_start)
        remove_project = script[remove_project_start:remove_project_end]
        self.assertNotIn('Write-JsonFile $ProjectsIndex', remove_project)
        self.assertIn('return Regenerate-GlobalIndexes', remove_project)
        for function_name in ["Invoke-OneProjectClean", "Invoke-OneMonthClean", "Invoke-AllProjectsClean"]:
            start = script.index(f"function {function_name}")
            end = script.find("\nfunction ", start + 1)
            block = script[start:] if end < 0 else script[start:end]
            self.assertLess(block.index("Assert-GitHubAuthorization"), block.index("Backup-CleanTransaction"))
            self.assertIn("Restore-CleanTransaction", block)

    def test_crup_repairs_only_global_indexes_from_current_project_latest_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            generated = root / "public" / "generated"
            for project_id, period, fingerprint in [
                ("project-a", "2026-05", "sha-a"),
                ("project-b", "2026-06", "sha-b"),
            ]:
                latest = generated / "projects" / project_id / "latest.json"
                latest.parent.mkdir(parents=True, exist_ok=True)
                latest.write_text(json.dumps({
                    "project_id": project_id,
                    "project_name": project_id,
                    "reporting_period": period,
                    "source": {"sha256": fingerprint},
                    "metrics": {},
                    "capabilities": {},
                    "quality": [],
                    "manifest": {},
                }), encoding="utf-8")
            generated.mkdir(parents=True, exist_ok=True)
            (generated / "projects.json").write_text('[{"value": [], "Count": 0}]', encoding="utf-8")

            payload = load_crup_payload(root)
            findings, count = payload["aggregate_index_findings"]()
            self.assertEqual(count, 2)
            self.assertTrue(findings)
            with patch.object(builtins, "input", return_value="REPAIR"):
                repaired, stopped = payload["offer_aggregate_repair"]()
            self.assertTrue(repaired)
            self.assertFalse(stopped)
            registry = json.loads((generated / "projects.json").read_text(encoding="utf-8"))
            portfolio = json.loads((generated / "portfolio" / "latest.json").read_text(encoding="utf-8"))
            self.assertEqual([row["project_id"] for row in registry], ["project-a", "project-b"])
            self.assertEqual(portfolio["project_count"], 2)
            self.assertEqual([row["project_id"] for row in portfolio["projects"]], ["project-a", "project-b"])
            self.assertEqual(payload["aggregate_index_findings"](), ([], 2))

    def test_single_private_token_file_is_loaded_by_all_github_publishers(self):
        gitignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
        clean = (ROOT / "Clean_Vercel.bat").read_text(encoding="utf-8")
        generated_publisher = (ROOT / "tools" / "publish_generated_delta.ps1").read_text(encoding="utf-8")
        main_publisher = (ROOT / "tools" / "push_main.ps1").read_text(encoding="utf-8")
        self.assertIn(".runtime/", gitignore)
        self.assertIn(".runtime/github-token.txt", gitignore)
        for script in (clean, generated_publisher, main_publisher):
            self.assertIn('.runtime\\github-token.txt', script)
            self.assertIn("PASTE_GITHUB_TOKEN_HERE", script)

    def test_wrappers_fail_loudly_and_return_child_exit_codes(self):
        powershell = (ROOT / "powershell.bat").read_text(encoding="utf-8")
        crup = (ROOT / "CrUp_JSON.bat").read_text(encoding="utf-8")
        clean = (ROOT / "Clean_Vercel.bat").read_text(encoding="utf-8")
        for name, wrapper in (("Clean_Vercel.bat", clean), ("CrUp_JSON.bat", crup), ("powershell.bat", powershell)):
            self.assertTrue('set "MANUAL_GITHUB_TOKEN=' in wrapper, f"{name} is missing the manual token variable")
            self.assertIn('never commit or share this BAT', wrapper, f"{name} is missing the token safety warning")
        self.assertIn("setlocal EnableExtensions DisableDelayedExpansion", powershell)
        self.assertIn("-MaxAttempts 6", powershell)
        self.assertIn("-PowerShellOnly", powershell)
        self.assertIn("exit /b %RESULT%", powershell)
        self.assertIn("where python", crup)
        self.assertIn("python -u $helper", crup)
        self.assertIn("No success confirmation was issued for this source.", crup)
        self.assertIn("-PowerShellOnly", clean)

    def test_powershell_only_publisher_has_no_git_requirement(self):
        script = (ROOT / "tools" / "publish_generated_delta.ps1").read_text(encoding="utf-8")
        self.assertIn("PowerShellOnly", script)
        self.assertIn("Publish-WithGitHubApi", script)
        self.assertIn("git.exe is not required", script)
        self.assertIn("Always hash the exact bytes that will be uploaded", script)
        self.assertNotIn("Git is required for the safe generated-data publisher", script)

    def test_push_main_uses_password_and_token_only_github_api(self):
        wrapper = (ROOT / "push_main.bat").read_text(encoding="utf-8")
        script = (ROOT / "tools" / "push_main.ps1").read_text(encoding="utf-8")
        self.assertIn("require_manual_bat_password.ps1", wrapper)
        self.assertIn('set "MANUAL_GITHUB_TOKEN=PASTE_GITHUB_TOKEN_HERE"', wrapper)
        self.assertIn('set "GITHUB_TOKEN=%MANUAL_GITHUB_TOKEN%"', wrapper)
        self.assertIn("never commit or share this BAT", wrapper)
        self.assertIn("Get-RemoteSnapshot", script)
        self.assertIn("Get-GitBlobSha", script)
        self.assertIn("Get-DeltaPlan", script)
        self.assertIn("public/generated", script)
        self.assertIn("public/ola-rise/game.js", script)
        self.assertIn("token-bearing manual BAT files", script)
        self.assertIn("force = $false", script)
        self.assertIn("Type PUSH MAIN exactly", script)
        self.assertNotIn("Get-Command git", script)
        self.assertNotIn("& git", script)

    def test_start_local_app_supports_urls_and_ctrl_c_refresh(self):
        wrapper = (ROOT / "START_LOCAL_APP.bat").read_text(encoding="utf-8")
        script = (ROOT / "tools" / "start_local_app.ps1").read_text(encoding="utf-8")
        self.assertIn("tools\\start_local_app.ps1", wrapper)
        self.assertIn("ConsoleCancelEventHandler", script)
        self.assertIn("Y = exit, N = keep/restart, R = refresh connection and restart", script)
        self.assertIn(".next\\cache", script)
        self.assertIn("/api/health?refresh=", script)
        self.assertIn("Local URL:", script)
        self.assertIn("Same-network URL:", script)
        self.assertIn("Public Vercel URL:", script)


if __name__ == "__main__":
    unittest.main()
