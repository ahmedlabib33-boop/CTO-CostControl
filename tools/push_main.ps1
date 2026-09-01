[CmdletBinding()]
param(
    [string]$Root = "",
    [string]$Owner = "ahmedlabib33-boop",
    [string]$Repository = "CTO-CostControl",
    [string]$Branch = "main",
    [string]$CommitMessage = "",
    [switch]$PlanOnly,
    [switch]$SelfTest,
    [ValidateRange(1, 8)][int]$MaxAttempts = 4
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
[Net.ServicePointManager]::Expect100Continue = $false
[Net.ServicePointManager]::DefaultConnectionLimit = 20

if ([string]::IsNullOrWhiteSpace($Root)) {
    $Root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
}
$Root = [IO.Path]::GetFullPath($Root)

# These are intentionally local-only. Generated JSON is published by
# powershell.bat, while source workbooks and pasted credentials never belong
# in the application commit.
$ExcludedDirectoryPattern = '(^|/)(\.git|\.next|node_modules|\.runtime|\.tmp|__pycache__|\.pytest_cache|logs|INPUT|Old workbooks|public/generated|samples)(/|$)'
$ExcludedFilePattern = '(^|/)(Clean_Vercel|CrUp_JSON|powershell|push_main)\.bat$|(^|/)\.env($|\.)|\.(xlsx|xlsm|xlsb|xls|otf|xsf|xdf|pem|pfx|p12|key|tsbuildinfo)$'

function Get-NormalizedRelativePath([string]$FullPath) {
    $rootPrefix = $Root.TrimEnd('\') + '\'
    $relative = if ($FullPath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        $FullPath.Substring($rootPrefix.Length)
    }
    else {
        throw "File is outside the repository root: $FullPath"
    }
    return ($relative -replace '\\', '/')
}

function Is-PublishablePath([string]$Path) {
    $normalized = $Path -replace '\\', '/'
    return ($normalized -notmatch $ExcludedDirectoryPattern -and $normalized -notmatch $ExcludedFilePattern)
}

function Get-GitBlobSha([byte[]]$Bytes) {
    $sha1 = [Security.Cryptography.SHA1]::Create()
    try {
        $header = [Text.Encoding]::UTF8.GetBytes("blob $($Bytes.Length)`0")
        [void]$sha1.TransformBlock($header, 0, $header.Length, $null, 0)
        [void]$sha1.TransformFinalBlock($Bytes, 0, $Bytes.Length)
        return (($sha1.Hash | ForEach-Object { $_.ToString("x2") }) -join "")
    }
    finally {
        $sha1.Dispose()
    }
}

function Get-LocalSnapshot {
    $files = @{}
    Get-ChildItem -LiteralPath $Root -Recurse -Force -File -ErrorAction Stop |
        ForEach-Object {
            $relative = Get-NormalizedRelativePath $_.FullName
            if (-not (Is-PublishablePath $relative)) { return }
            $bytes = [IO.File]::ReadAllBytes($_.FullName)
            $files[$relative] = [pscustomobject]@{
                Path = $relative
                File = $_.FullName
                Bytes = $bytes
                Sha = Get-GitBlobSha $bytes
            }
        }
    return $files
}

function Get-DeltaPlan([hashtable]$Local, [hashtable]$Remote) {
    $changes = [System.Collections.Generic.List[object]]::new()
    foreach ($path in @($Local.Keys | Sort-Object)) {
        $remoteSha = if ($Remote.ContainsKey($path)) { [string]$Remote[$path].Sha } else { "" }
        if ($remoteSha -ne [string]$Local[$path].Sha) {
            $changes.Add([pscustomobject]@{
                Path = $path
                Kind = if ($remoteSha) { "UPDATE" } else { "NEW" }
                Sha = [string]$Local[$path].Sha
                File = $Local[$path].File
                Bytes = $Local[$path].Bytes
            })
        }
    }
    return @($changes)
}

if ($SelfTest) {
    $sample = [Text.Encoding]::ASCII.GetBytes("hello`n")
    if ((Get-GitBlobSha $sample) -ne "ce013625030ba8dba906f756967f9e9ca394464a") { throw "Git blob hashing self-test failed." }
    if (Is-PublishablePath "public/generated/projects/a.json") { throw "Generated exclusion self-test failed." }
    if (Is-PublishablePath "CrUp_JSON.bat") { throw "Credential BAT exclusion self-test failed." }
    if (-not (Is-PublishablePath "public/ola-rise/game.js")) { throw "Game-layer inclusion self-test failed." }
    Write-Host "PUSH-MAIN SELF-TEST PASS" -ForegroundColor Green
    exit 0
}

$token = $env:GITHUB_TOKEN
if ([string]::IsNullOrWhiteSpace($token)) {
    $tokenFilePath = Join-Path $Root ".runtime\github-token.txt"
    if (Test-Path -LiteralPath $tokenFilePath -PathType Leaf) {
        $stored = (Get-Content -LiteralPath $tokenFilePath -Raw).Trim()
        if ($stored -and $stored -ne "PASTE_GITHUB_TOKEN_HERE") { $token = $stored }
    }
}
if (-not $PlanOnly -and [string]::IsNullOrWhiteSpace($token)) {
    $secureToken = Read-Host "Paste GitHub token (input is hidden)" -AsSecureString
    $pointer = [IntPtr]::Zero
    try {
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
        $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    }
    finally {
        if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    }
}
if (-not $PlanOnly -and [string]::IsNullOrWhiteSpace($token)) { throw "No GitHub token was provided. Nothing was published." }

$headers = @{
    Accept = "application/vnd.github+json"
    "X-GitHub-Api-Version" = "2022-11-28"
    "User-Agent" = "CTO-CostControl-Main-Publisher"
}
if ($token) { $headers.Authorization = "Bearer $token" }
$api = "https://api.github.com/repos/$Owner/$Repository"

function Invoke-GitHub([string]$Method, [string]$Uri, $Body = $null) {
    $arguments = @{ Method = $Method; Headers = $headers; Uri = $Uri; TimeoutSec = 120 }
    if ($null -ne $Body) {
        $arguments.ContentType = "application/json"
        $arguments.Body = ($Body | ConvertTo-Json -Depth 20 -Compress)
    }
    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        try { return Invoke-RestMethod @arguments }
        catch {
            $caught = $_
            $status = 0
            try { $status = [int]$caught.Exception.Response.StatusCode } catch { }
            if ($status -eq 401) { throw "GitHub rejected the token (401). Use a token with repository Contents read/write permission." }
            if ($status -eq 403) { throw "GitHub refused repository access (403). Check token permissions and repository access." }
            $retryable = $status -eq 0 -or $status -in @(408, 429, 500, 502, 503, 504)
            if ($retryable -and $attempt -lt $MaxAttempts) {
                $delay = [Math]::Min(8, [Math]::Pow(2, $attempt - 1))
                Write-Host "Temporary GitHub connection failure; retrying in $delay second(s)..." -ForegroundColor Yellow
                Start-Sleep -Seconds $delay
                continue
            }
            throw $caught
        }
    }
}

function Get-RemoteSnapshot {
    $ref = Invoke-GitHub GET "$api/git/ref/heads/$Branch"
    $parentSha = [string]$ref.object.sha
    $commit = Invoke-GitHub GET "$api/git/commits/$parentSha"
    $tree = Invoke-GitHub GET "$api/git/trees/$([string]$commit.tree.sha)?recursive=1"
    if ($tree.truncated) { throw "GitHub returned a truncated repository tree. Publishing stopped safely." }
    $remote = @{}
    foreach ($entry in $tree.tree) {
        if ($entry.type -ne "blob") { continue }
        $remote[[string]$entry.path] = [pscustomobject]@{ Sha = [string]$entry.sha; Mode = [string]$entry.mode }
    }
    return [pscustomobject]@{ ParentSha = $parentSha; TreeSha = [string]$commit.tree.sha; Files = $remote }
}

function Confirm-RemoteCommit([string]$ExpectedSha) {
    $lastSeen = ""
    for ($attempt = 1; $attempt -le 8; $attempt++) {
        $cacheBust = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        $verifiedRef = Invoke-GitHub GET "$api/git/ref/heads/$Branch?verify=$cacheBust"
        $lastSeen = [string]$verifiedRef.object.sha
        if ($lastSeen -eq $ExpectedSha) { return $lastSeen }

        # Another approved publisher or deployment may move main immediately
        # after this commit. Treat that as success only when the current main
        # commit is a descendant of the commit created by this run.
        if ($lastSeen) {
            try {
                $comparison = Invoke-GitHub GET "$api/compare/$ExpectedSha...$lastSeen?verify=$cacheBust"
                if ([string]$comparison.merge_base_commit.sha -eq $ExpectedSha -and [string]$comparison.status -in @("ahead", "identical")) {
                    return $lastSeen
                }
            }
            catch { }
        }
        if ($attempt -lt 8) { Start-Sleep -Seconds 2 }
    }
    throw "GitHub ref verification failed after retries. Expected commit $ExpectedSha; main reported $lastSeen."
}

try {
    Set-Location -LiteralPath $Root
    Write-Host "CTO COSTCONTROL - REVIEW AND PUSH APPLICATION CHANGES" -ForegroundColor Cyan
    Write-Host "Git executable is not required. This compares local source with GitHub $Branch through the API." -ForegroundColor Gray
    Write-Host "Excluded: generated JSON, INPUT/source workbooks, caches, secrets, and token-bearing manual BAT files." -ForegroundColor Yellow

    $local = Get-LocalSnapshot
    $remoteSnapshot = Get-RemoteSnapshot
    $changes = @(Get-DeltaPlan $local $remoteSnapshot.Files)

    Write-Host "Local publishable files: $($local.Count)" -ForegroundColor DarkGray
    Write-Host "New or changed application files: $($changes.Count)" -ForegroundColor DarkGray
    if ($changes.Count -eq 0) {
        Write-Host "Nothing is different from GitHub main. Nothing was committed or pushed." -ForegroundColor Green
        exit 0
    }

    Write-Host ""
    Write-Host "EXACT FILES AVAILABLE FOR COMMIT" -ForegroundColor Cyan
    for ($i = 0; $i -lt $changes.Count; $i++) {
        Write-Host ("{0,3} - {1} {2}" -f ($i + 1), $changes[$i].Kind, $changes[$i].Path) -ForegroundColor White
    }
    Write-Host ""
    Write-Host "A = include every listed application change" -ForegroundColor Cyan
    Write-Host "S = select file numbers" -ForegroundColor Cyan
    Write-Host "Q = exit without changing GitHub" -ForegroundColor Cyan
    $choice = (Read-Host "Choose").Trim().ToUpperInvariant()
    if ($choice -eq "Q") { Write-Host "Cancelled. Nothing was committed or pushed." -ForegroundColor Yellow; exit 0 }
    if ($choice -eq "S") {
        $raw = Read-Host "Enter numbers separated by commas"
        $indexes = @($raw -split ',' | ForEach-Object {
            $number = 0
            if (-not [int]::TryParse($_.Trim(), [ref]$number) -or $number -lt 1 -or $number -gt $changes.Count) { throw "Invalid selection: $_" }
            $number - 1
        } | Select-Object -Unique)
        $changes = @($indexes | ForEach-Object { $changes[$_] })
    }
    elseif ($choice -ne "A") {
        throw "Invalid choice. Use A, S, or Q."
    }
    if ($changes.Count -eq 0) { throw "No files selected for the commit." }

    Write-Host ""
    Write-Host "SELECTED COMMIT CONTENT" -ForegroundColor Cyan
    $changes | ForEach-Object { Write-Host ("{0} {1}" -f $_.Kind, $_.Path) }
    if ([string]::IsNullOrWhiteSpace($CommitMessage)) {
        $CommitMessage = Read-Host "Commit message [feat: publish application changes]"
        if ([string]::IsNullOrWhiteSpace($CommitMessage)) { $CommitMessage = "feat: publish application changes" }
    }
    if ($PlanOnly) {
        Write-Host "PLAN ONLY: GitHub was not changed." -ForegroundColor Yellow
        exit 0
    }

    $approval = Read-Host "Type PUSH MAIN exactly to commit and push"
    if ($approval -cne "PUSH MAIN") {
        Write-Host "Approval not received. Nothing was committed or pushed." -ForegroundColor Yellow
        exit 0
    }

    # Re-read the branch before writing so a concurrent push cannot be overwritten.
    $freshRef = Invoke-GitHub GET "$api/git/ref/heads/$Branch"
    if ([string]$freshRef.object.sha -ne $remoteSnapshot.ParentSha) {
        throw "GitHub main changed while this preview was open. Refresh and review again; nothing was pushed."
    }

    $treeEntries = @()
    foreach ($change in $changes) {
        $blob = Invoke-GitHub POST "$api/git/blobs" @{ content = [Convert]::ToBase64String([byte[]]$change.Bytes); encoding = "base64" }
        if ([string]$blob.sha -ne [string]$change.Sha) { throw "GitHub blob verification failed for $($change.Path)." }
        $treeEntries += @{ path = [string]$change.Path; mode = "100644"; type = "blob"; sha = [string]$blob.sha }
        Write-Host "Uploaded $($change.Path)" -ForegroundColor DarkGray
    }
    $tree = Invoke-GitHub POST "$api/git/trees" @{ base_tree = $remoteSnapshot.TreeSha; tree = $treeEntries }
    $newCommit = Invoke-GitHub POST "$api/git/commits" @{ message = $CommitMessage; tree = [string]$tree.sha; parents = @($remoteSnapshot.ParentSha) }
    $newCommitSha = [string]$newCommit.sha
    [void](Invoke-GitHub PATCH "$api/git/refs/heads/$Branch" @{ sha = $newCommitSha; force = $false })
    $verifiedSha = Confirm-RemoteCommit $newCommitSha

    Write-Host ""
    Write-Host "VERIFIED SUCCESS" -ForegroundColor Green
    Write-Host "Commit: $newCommitSha" -ForegroundColor Green
    Write-Host "Verified main: $verifiedSha" -ForegroundColor Green
    Write-Host "Files published: $($changes.Count)" -ForegroundColor Green
    Write-Host "Vercel will build from GitHub main if its project is connected to this branch." -ForegroundColor Cyan
}
catch {
    Write-Host ""
    Write-Host "STOPPED: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
finally {
    $token = $null
}
