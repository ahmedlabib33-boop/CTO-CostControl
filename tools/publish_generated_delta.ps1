[CmdletBinding()]
param(
    [string]$RepoRoot = "",
    [string]$Owner = "ahmedlabib33-boop",
    [string]$Repository = "CTO-CostControl",
    [string]$Branch = "main",
    [string]$CommitMessage = "chore(data): publish changed generated JSON",
    [string]$DeleteProjectId = "",
    [string]$DeletePeriod = "",
    [switch]$PlanOnly,
    [switch]$MirrorGenerated,
    [switch]$SelfTest,
    [ValidateRange(1, 8)][int]$MaxAttempts = 4
)

$ErrorActionPreference = "Stop"
$GeneratedPrefix = "public/generated/"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
[Net.ServicePointManager]::Expect100Continue = $false
[Net.ServicePointManager]::DefaultConnectionLimit = 20

function Get-GitBlobSha([string]$Path, [string]$GitPath = "") {
    if (-not [string]::IsNullOrWhiteSpace($GitPath)) {
        Push-Location $RepoRoot
        try {
            $filteredSha = (& git hash-object "--path=$GitPath" -- $Path).Trim()
            if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($filteredSha)) {
                throw "Git could not calculate the normalized blob hash for $GitPath."
            }
            return $filteredSha
        }
        finally {
            Pop-Location
        }
    }
    $stream = [IO.File]::OpenRead($Path)
    $sha1 = [Security.Cryptography.SHA1]::Create()
    try {
        $header = [Text.Encoding]::UTF8.GetBytes("blob $($stream.Length)`0")
        [void]$sha1.TransformBlock($header, 0, $header.Length, $null, 0)
        $buffer = New-Object byte[] (1024 * 1024)
        while (($read = $stream.Read($buffer, 0, $buffer.Length)) -gt 0) {
            [void]$sha1.TransformBlock($buffer, 0, $read, $null, 0)
        }
        [void]$sha1.TransformFinalBlock([byte[]]::new(0), 0, 0)
        return (($sha1.Hash | ForEach-Object { $_.ToString("x2") }) -join "")
    }
    finally {
        $stream.Dispose()
        $sha1.Dispose()
    }
}

function Get-DeltaPlan([hashtable]$Local, [hashtable]$Remote) {
    $changes = [System.Collections.Generic.List[object]]::new()
    $unchanged = 0
    foreach ($path in @($Local.Keys | Sort-Object)) {
        $remoteSha = if ($Remote.ContainsKey($path)) { [string]$Remote[$path] } else { "" }
        if ($remoteSha -eq [string]$Local[$path].Sha) {
            $unchanged++
        }
        else {
            $changes.Add([pscustomobject]@{
                Path = $path
                Kind = if ($remoteSha) { "UPDATE" } else { "NEW" }
                Sha = [string]$Local[$path].Sha
                File = $Local[$path].File
            })
        }
    }
    $remoteOnly = @($Remote.Keys | Where-Object { -not $Local.ContainsKey($_) } | Sort-Object)
    return [pscustomobject]@{ Changes = @($changes); Unchanged = $unchanged; RemoteOnly = $remoteOnly }
}

function Remove-LineEndingFalsePositives($Plan, [hashtable]$Remote, [string]$RemoteHead) {
    $localHead = (& git -C $RepoRoot rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0 -or $localHead -ne $RemoteHead) { return $Plan }
    $confirmed = [System.Collections.Generic.List[object]]::new()
    $normalizedMatches = 0
    foreach ($change in @($Plan.Changes)) {
        $changePath = [string]$change.Path
        if (-not $Remote.ContainsKey($changePath)) {
            $confirmed.Add($change)
            continue
        }
        $worktreeStatus = @(& git -C $RepoRoot status --porcelain --untracked-files=all -- $changePath)
        if ($LASTEXITCODE -ne 0 -or $worktreeStatus.Count) { $confirmed.Add($change) }
        else { $normalizedMatches++ }
    }
    return [pscustomobject]@{
        Changes = @($confirmed)
        Unchanged = [int]$Plan.Unchanged + $normalizedMatches
        RemoteOnly = @($Plan.RemoteOnly)
    }
}

if ($SelfTest) {
    $temporary = Join-Path ([IO.Path]::GetTempPath()) ("cto-git-blob-" + [guid]::NewGuid().ToString("N") + ".txt")
    try {
        [IO.File]::WriteAllBytes($temporary, [Text.Encoding]::ASCII.GetBytes("hello`n"))
        if ((Get-GitBlobSha $temporary) -ne "ce013625030ba8dba906f756967f9e9ca394464a") { throw "Git blob hash self-test failed." }
        $local = @{ "public/generated/a.json" = [pscustomobject]@{ Sha = "same"; File = "a" }; "public/generated/b.json" = [pscustomobject]@{ Sha = "new"; File = "b" } }
        $remote = @{ "public/generated/a.json" = "same"; "public/generated/remote-only.json" = "keep" }
        $plan = Get-DeltaPlan $local $remote
        if ($plan.Changes.Count -ne 1 -or $plan.Changes[0].Path -ne "public/generated/b.json") { throw "Delta classification self-test failed." }
        if ($plan.RemoteOnly.Count -ne 1 -or $plan.RemoteOnly[0] -ne "public/generated/remote-only.json") { throw "Remote preservation self-test failed." }
        Write-Host "SELF-TEST PASS: exact Git hashes, changed-only planning, and remote-only preservation." -ForegroundColor Green
        exit 0
    }
    finally {
        Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
    }
}

if ([string]::IsNullOrWhiteSpace($RepoRoot)) { $RepoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..")) }
$RepoRoot = [IO.Path]::GetFullPath($RepoRoot)
$folder = Join-Path $RepoRoot "public\generated"
if (-not (Test-Path -LiteralPath $folder -PathType Container)) { throw "Generated folder not found: $folder" }

$tokenFilePath = Join-Path $RepoRoot ".runtime\github-token.txt"
$token = $env:GITHUB_TOKEN
if ([string]::IsNullOrWhiteSpace($token) -and (Test-Path -LiteralPath $tokenFilePath -PathType Leaf)) {
    $storedToken = (Get-Content -LiteralPath $tokenFilePath -Raw).Trim()
    if ($storedToken -and $storedToken -ne "PASTE_GITHUB_TOKEN_HERE") { $token = $storedToken }
}
if (-not $PlanOnly -and ([string]::IsNullOrWhiteSpace($token) -or $token -eq "PASTE_YOUR_TOKEN_HERE")) {
    Write-Host "GitHub token is required to publish changed generated JSON." -ForegroundColor Yellow
    Write-Host "You can save it once in: $tokenFilePath" -ForegroundColor DarkGray
    $secureToken = Read-Host "Paste GITHUB_TOKEN (input is hidden)" -AsSecureString
    $tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
    try { $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer) }
    if ([string]::IsNullOrWhiteSpace($token)) { throw "No GitHub token was entered. Nothing was uploaded." }
}
$headers = @{
    Accept = "application/vnd.github+json"
    "X-GitHub-Api-Version" = "2022-11-28"
    "User-Agent" = "CTO-CostControl-Delta-Publisher"
}
if (-not [string]::IsNullOrWhiteSpace($token)) { $headers.Authorization = "Bearer $token" }
$api = "https://api.github.com/repos/$Owner/$Repository"

function Invoke-GitHub([string]$Method, [string]$Uri, $Body = $null) {
    $arguments = @{ Method = $Method; Headers = $headers; Uri = $Uri }
    if ($null -ne $Body) {
        $arguments.ContentType = "application/json"
        $arguments.Body = ($Body | ConvertTo-Json -Depth 12 -Compress)
    }
    $arguments.TimeoutSec = 120
    for ($requestAttempt = 1; $requestAttempt -le $MaxAttempts; $requestAttempt++) {
        try { return Invoke-RestMethod @arguments }
        catch {
            $caught = $_
            $statusCode = 0
            try { $statusCode = [int]$caught.Exception.Response.StatusCode } catch { }
            if ($statusCode -eq 401) { throw "GitHub rejected the token (401 Unauthorized). Nothing was committed. Use a valid fine-grained token with Contents: Read and write." }
            if ($statusCode -eq 403) { throw "GitHub refused repository access (403 Forbidden). Nothing was committed. Check repository access and Contents: Read and write." }
            $transient = $statusCode -eq 0 -or $statusCode -in @(408, 429, 500, 502, 503, 504)
            if ($transient -and $requestAttempt -lt $MaxAttempts) {
                $delay = [Math]::Min(8, [Math]::Pow(2, $requestAttempt - 1))
                Write-Host "Temporary GitHub connection failure during $Method. Retrying in $delay second(s) ($requestAttempt/$MaxAttempts)..." -ForegroundColor Yellow
                Start-Sleep -Seconds $delay
                continue
            }
            if ($transient) { throw "GitHub $Method failed after $MaxAttempts attempts. No branch commit was created. $($caught.Exception.Message)" }
            throw $caught
        }
    }
}

function Get-RemoteSnapshot {
    $ref = Invoke-GitHub "GET" "$api/git/ref/heads/$Branch"
    $parentSha = [string]$ref.object.sha
    $commit = Invoke-GitHub "GET" "$api/git/commits/$parentSha"
    $rootTreeSha = [string]$commit.tree.sha
    $remote = @{}
    $remoteHashes = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)

    $rootTree = Invoke-GitHub "GET" "$api/git/trees/$rootTreeSha"
    $publicEntry = @($rootTree.tree | Where-Object { $_.type -eq "tree" -and $_.path -eq "public" } | Select-Object -First 1)
    if ($publicEntry) {
        $publicTree = Invoke-GitHub "GET" "$api/git/trees/$($publicEntry.sha)"
        $generatedEntry = @($publicTree.tree | Where-Object { $_.type -eq "tree" -and $_.path -eq "generated" } | Select-Object -First 1)
        if ($generatedEntry) {
            $generatedTree = Invoke-GitHub "GET" "$api/git/trees/$($generatedEntry.sha)?recursive=1"
            if ($generatedTree.truncated) { throw "GitHub truncated public/generated. Upload stopped safely." }
            foreach ($entry in $generatedTree.tree) {
                if ($entry.type -ne "blob") { continue }
                $path = "$GeneratedPrefix$($entry.path)"
                $remote[$path] = [string]$entry.sha
                [void]$remoteHashes.Add([string]$entry.sha)
            }
        }
    }
    return [pscustomobject]@{ ParentSha = $parentSha; RootTreeSha = $rootTreeSha; Files = $remote; Hashes = $remoteHashes }
}

function Publish-WithNativeGit([object[]]$Changes, [string[]]$Deletions, [string]$ExpectedRemoteSha) {
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw "Git is required for the safe generated-data publisher." }
    $changePaths = @($Changes | ForEach-Object { [string]$_.Path })
    $deletePaths = @($Deletions | ForEach-Object { [string]$_ })
    $paths = @($changePaths + $deletePaths | Sort-Object -Unique)
    if (-not $paths.Count) { return }

    Push-Location $RepoRoot
    $commitCreated = $false
    try {
        $branchName = (& git branch --show-current).Trim()
        if ($LASTEXITCODE -ne 0 -or $branchName -ne $Branch) {
            throw "Local Git branch must be '$Branch' before publishing generated data. Current branch: '$branchName'."
        }
        # Refresh the remote-tracking ref. A previous app commit may have moved
        # origin/main while this checkout was closed. Fast-forward only when the
        # local branch is strictly behind and none of the user's worktree files
        # overlap the incoming commits; never rebase, force, or discard changes.
        & git fetch --quiet origin $Branch
        if ($LASTEXITCODE -ne 0) { throw "Git could not refresh origin/$Branch before publishing. Nothing was committed." }
        $localHead = (& git rev-parse HEAD).Trim()
        if ($LASTEXITCODE -ne 0 -or $localHead -ne $ExpectedRemoteSha) {
            $behind = 0
            $ahead = 0
            try { $behind = [int]((& git rev-list --count "$localHead..$ExpectedRemoteSha").Trim()); $ahead = [int]((& git rev-list --count "$ExpectedRemoteSha..$localHead").Trim()) } catch { }
            if ($ahead -eq 0 -and $behind -gt 0) {
                $incoming = @(& git diff --name-only "$localHead..$ExpectedRemoteSha")
                $worktree = @(& git status --porcelain --untracked-files=all)
                $overlap = @($worktree | Where-Object {
                    $line = [string]$_
                    $path = if ($line.Length -gt 3) { $line.Substring(3).Trim().Trim('"') } else { "" }
                    $path -and (@($incoming | Where-Object { $_ -eq $path }).Count -gt 0)
                })
                if ($overlap.Count) { throw "Local main is behind GitHub and an uncommitted file overlaps the incoming commit ($($overlap -join ', ')). Pull main manually; nothing was committed." }
                & git merge --ff-only $ExpectedRemoteSha
                if ($LASTEXITCODE -ne 0) { throw "Local main could not be fast-forwarded to GitHub main. Nothing was committed." }
                $localHead = (& git rev-parse HEAD).Trim()
            }
            if ($localHead -ne $ExpectedRemoteSha) {
                throw "Local $Branch is not synchronized with GitHub $Branch. Pull the latest main first; nothing was committed."
            }
        }
        $alreadyStaged = @(& git diff --cached --name-only)
        if ($LASTEXITCODE -ne 0) { throw "Could not inspect the Git staging area." }
        if ($alreadyStaged.Count) {
            throw "The Git staging area already contains changes. Commit or unstage them before running powershell.bat; nothing was added."
        }

        Write-Host "Staging $($changePaths.Count) changed generated file(s) and $($deletePaths.Count) explicitly approved deletion(s)..." -ForegroundColor Cyan
        if ($changePaths.Count) {
            & git add -- @changePaths
            if ($LASTEXITCODE -ne 0) { throw "Git could not stage the changed generated files." }
        }
        if ($deletePaths.Count) {
            & git add -u -- @deletePaths
            if ($LASTEXITCODE -ne 0) { throw "Git could not stage the explicitly approved generated deletions." }
        }
        $staged = @(& git diff --cached --name-only)
        if ($LASTEXITCODE -ne 0 -or -not $staged.Count) { throw "No generated changes reached the staging area." }
        $unexpected = @($staged | Where-Object { $_ -notin $paths })
        if ($unexpected.Count) { throw "Safety stop: an unrelated file entered the generated-data commit: $($unexpected -join ', ')" }

        & git commit -m $CommitMessage
        if ($LASTEXITCODE -ne 0) { throw "Git could not create the generated-data commit." }
        $commitCreated = $true
        $newCommit = (& git rev-parse HEAD).Trim()

        # Git's HTTPS transport requires Basic auth with the token as the
        # password; the GitHub REST API above uses Bearer separately.
        $basic = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("x-access-token:$token"))
        $pushHeader = "Authorization: Basic $basic"
        $pushed = $false
        for ($pushAttempt = 1; $pushAttempt -le $MaxAttempts; $pushAttempt++) {
            & git -c "http.version=HTTP/1.1" -c "http.extraHeader=$pushHeader" push origin "HEAD:refs/heads/$Branch"
            if ($LASTEXITCODE -eq 0) { $pushed = $true; break }
            if ($pushAttempt -lt $MaxAttempts) {
                $delay = [Math]::Min(10, [Math]::Pow(2, $pushAttempt - 1))
                Write-Host "Temporary GitHub push failure. Retrying in $delay second(s) ($pushAttempt/$MaxAttempts)..." -ForegroundColor Yellow
                Start-Sleep -Seconds $delay
            }
        }
        if (-not $pushed) {
            throw "GitHub push failed after $MaxAttempts attempts. The local commit $newCommit is preserved; rerun powershell.bat to retry safely."
        }
        $remoteHead = (& git -c "http.version=HTTP/1.1" -c "http.extraHeader=$pushHeader" ls-remote origin "refs/heads/$Branch" | ForEach-Object { ($_ -split "`t")[0] }).Trim()
        if ($LASTEXITCODE -ne 0 -or $remoteHead -ne $newCommit) { throw "GitHub push completed but the remote commit could not be verified." }
        Write-Host "SUCCESS: GitHub commit $newCommit" -ForegroundColor Green
        Write-Host "Committed exactly $($changePaths.Count) new/changed generated file(s) and $($deletePaths.Count) explicitly approved deletion(s)." -ForegroundColor Green
    }
    catch {
        if (-not $commitCreated) {
            & git reset -q HEAD -- @paths 2>$null
        }
        throw
    }
    finally {
        Pop-Location
    }
}

Write-Host "Scanning local public/generated and calculating exact Git blob hashes..." -ForegroundColor Cyan
$local = @{}
$files = @(Get-ChildItem -LiteralPath $folder -Recurse -File)
if (-not $files.Count) { throw "No generated files were found." }
foreach ($file in $files) {
    $relative = $file.FullName.Substring($folder.Length).TrimStart([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar).Replace("\", "/")
    $path = "$GeneratedPrefix$relative"
    $local[$path] = [pscustomobject]@{ Sha = Get-GitBlobSha $file.FullName $path; File = $file.FullName }
}

$uploadedHashes = @{}
for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    Write-Host "Reading latest GitHub main tree (attempt $attempt of $MaxAttempts)..." -ForegroundColor Cyan
    $snapshot = Get-RemoteSnapshot
    $plan = Get-DeltaPlan $local $snapshot.Files
    $plan = Remove-LineEndingFalsePositives -Plan $plan -Remote $snapshot.Files -RemoteHead $snapshot.ParentSha
    $deletions = @()
    if ($MirrorGenerated) {
        $deletions = @($plan.RemoteOnly)
    }
    elseif (-not [string]::IsNullOrWhiteSpace($DeleteProjectId)) {
        $projectPrefix = "$GeneratedPrefix" + "projects/$DeleteProjectId/"
        if ([string]::IsNullOrWhiteSpace($DeletePeriod)) {
            $deletions = @($plan.RemoteOnly | Where-Object { $_.StartsWith($projectPrefix, [StringComparison]::OrdinalIgnoreCase) })
        }
        else {
            $periodPrefixes = @(
                "$projectPrefix" + "history/$DeletePeriod/",
                "$projectPrefix" + "raw/$DeletePeriod/",
                "$projectPrefix" + "enriched/$DeletePeriod/"
            )
            $deletions = @($plan.RemoteOnly | Where-Object {
                $candidate = [string]$_
                @($periodPrefixes | Where-Object { $candidate.StartsWith($_, [StringComparison]::OrdinalIgnoreCase) }).Count -gt 0
            })
        }
    }
    $preservedRemoteOnly = $plan.RemoteOnly.Count - $deletions.Count

    Write-Host "Local generated files: $($local.Count)"
    Write-Host "Unchanged in GitHub:    $($plan.Unchanged)" -ForegroundColor Green
    Write-Host "New or changed:        $($plan.Changes.Count)" -ForegroundColor Yellow
    Write-Host "Remote-only preserved: $preservedRemoteOnly" -ForegroundColor DarkGray
    if ($plan.Changes.Count) {
        $plan.Changes | ForEach-Object { Write-Host ("  {0,-6} {1}" -f $_.Kind, $_.Path) }
    }
    if ($deletions.Count) {
        $deletions | ForEach-Object { Write-Host ("  DELETE {0}" -f $_) -ForegroundColor Red }
        Write-Host "Deletion scope is explicit: only these remote generated files will be deleted." -ForegroundColor Yellow
    }
    if ($preservedRemoteOnly -gt 0) {
        Write-Host "Remote-only files are intentionally preserved. Clean_Vercel.bat handles deliberate deletion." -ForegroundColor DarkGray
    }
    $deleteCount = $deletions.Count
    if (-not $plan.Changes.Count -and -not $deleteCount) {
        Write-Host "NO CHANGES: every local generated file already matches GitHub exactly. No commit was created." -ForegroundColor Green
        exit 0
    }
    if ($PlanOnly) {
        Write-Host "PLAN ONLY: GitHub was not changed." -ForegroundColor Green
        exit 0
    }

    Publish-WithNativeGit -Changes @($plan.Changes) -Deletions @($deletions) -ExpectedRemoteSha $snapshot.ParentSha
    exit 0

    $entries = [System.Collections.Generic.List[object]]::new()
    foreach ($change in $plan.Changes) {
        $blobSha = [string]$change.Sha
        if ($snapshot.Hashes.Contains($blobSha)) {
            Write-Host "Reusing existing GitHub content for $($change.Path)"
        }
        elseif ($uploadedHashes.ContainsKey($blobSha)) {
            $blobSha = [string]$uploadedHashes[$blobSha]
        }
        else {
            Write-Host "Uploading changed content $($change.Path)" -ForegroundColor Yellow
            $bytes = [IO.File]::ReadAllBytes([string]$change.File)
            $blob = Invoke-GitHub "POST" "$api/git/blobs" @{ content = [Convert]::ToBase64String($bytes); encoding = "base64" }
            $blobSha = [string]$blob.sha
            if ($blobSha -ne [string]$change.Sha) { throw "GitHub blob verification failed for $($change.Path)." }
            $uploadedHashes[[string]$change.Sha] = $blobSha
        }
        $entries.Add(@{ path = [string]$change.Path; mode = "100644"; type = "blob"; sha = $blobSha })
    }
    foreach ($remotePath in $deletions) {
        $entries.Add(@{ path = [string]$remotePath; mode = "100644"; type = "blob"; sha = $null })
    }

    $freshRef = Invoke-GitHub "GET" "$api/git/ref/heads/$Branch"
    if ([string]$freshRef.object.sha -ne $snapshot.ParentSha) {
        Write-Host "GitHub main changed during comparison. Rechecking against the new main without forcing..." -ForegroundColor Yellow
        continue
    }

    $newTree = Invoke-GitHub "POST" "$api/git/trees" @{ base_tree = $snapshot.RootTreeSha; tree = @($entries) }
    $newCommit = Invoke-GitHub "POST" "$api/git/commits" @{ message = $CommitMessage; tree = [string]$newTree.sha; parents = @($snapshot.ParentSha) }
    try {
        [void](Invoke-GitHub "PATCH" "$api/git/refs/heads/$Branch" @{ sha = [string]$newCommit.sha; force = $false })
    }
    catch {
        $statusCode = 0
        try { $statusCode = [int]$_.Exception.Response.StatusCode } catch { }
        if ($statusCode -eq 422 -and $attempt -lt $MaxAttempts) {
            Write-Host "GitHub main moved before commit. Retrying safely; no force push will be used." -ForegroundColor Yellow
            continue
        }
        throw
    }

    $verified = Invoke-GitHub "GET" "$api/git/ref/heads/$Branch"
    if ([string]$verified.object.sha -ne [string]$newCommit.sha) { throw "GitHub commit verification failed." }
    Write-Host "SUCCESS: GitHub commit $($newCommit.sha)" -ForegroundColor Green
    Write-Host "Committed $($plan.Changes.Count) new or changed generated file(s) and $deleteCount deliberate deletion(s). Vercel publishing should start automatically." -ForegroundColor Green
    exit 0
}

throw "GitHub main kept changing. Nothing was force-pushed; run powershell.bat again."
