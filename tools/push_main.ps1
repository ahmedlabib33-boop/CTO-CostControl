$ErrorActionPreference = "Stop"
$Host.UI.RawUI.WindowTitle = "CTO CostControl - Review and Push Main"

$RepoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$OriginalIndex = $env:GIT_INDEX_FILE
$TempIndex = Join-Path ([IO.Path]::GetTempPath()) ("cto-push-main-index-" + [guid]::NewGuid().ToString("N"))
$BlockedPattern = '(^|/)(INPUT|Old workbooks)(/|$)|\.(xlsx|xlsm|xlsb|xls|otf|xsf|xdf)$|(^|/)\.env($|\.)|\.(pem|pfx|p12|key)$'

function Write-Title([string]$Text) {
    Write-Host ""
    Write-Host ("=" * 78) -ForegroundColor DarkCyan
    Write-Host $Text -ForegroundColor Cyan
    Write-Host ("=" * 78) -ForegroundColor DarkCyan
}

function Run-Git {
    param([Parameter(Mandatory=$true)][string[]]$Arguments, [switch]$Network)
    $prefix = @()
    if ($Network -and -not [string]::IsNullOrWhiteSpace($env:GITHUB_TOKEN)) {
        $prefix = @("-c", "http.extraHeader=Authorization: Bearer $($env:GITHUB_TOKEN)")
    }
    # Keep stderr separate so harmless Git warnings can never be mistaken for
    # filenames while a preview is being assembled.
    $stderrFile = [IO.Path]::GetTempFileName()
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $output = & git @prefix @Arguments 2> $stderrFile
        $exitCode = $LASTEXITCODE
        $errorOutput = if (Test-Path -LiteralPath $stderrFile) { @(Get-Content -LiteralPath $stderrFile -ErrorAction SilentlyContinue) } else { @() }
    }
    finally {
        $ErrorActionPreference = $previousPreference
        Remove-Item -LiteralPath $stderrFile -Force -ErrorAction SilentlyContinue
    }
    if ($exitCode -ne 0) {
        $details = @($output) + @($errorOutput)
        throw "git $($Arguments -join ' ') failed:`n$($details -join [Environment]::NewLine)"
    }
    return @($output)
}

function Get-CandidatePaths {
    return @(Run-Git @("diff", "--cached", "origin/main", "--name-only", "--diff-filter=ACDMRTUXB", "--") | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
}

function Show-Preview {
    param([string]$Heading)
    Write-Title $Heading
    $status = @(Run-Git @("diff", "--cached", "origin/main", "--name-status", "--"))
    $stat = @(Run-Git @("diff", "--cached", "origin/main", "--stat", "--"))
    if ($status.Count -eq 0) {
        Write-Host "No files selected." -ForegroundColor Yellow
        return
    }
    $status | ForEach-Object { Write-Host $_ -ForegroundColor White }
    Write-Host ""
    $stat | ForEach-Object { Write-Host $_ -ForegroundColor DarkGray }
}

try {
    Clear-Host
    Write-Title "CTO COSTCONTROL - REVIEW, COMMIT, AND PUSH TO GITHUB MAIN"
    Write-Host "This tool compares the current folder directly with GitHub origin/main." -ForegroundColor Gray
    Write-Host "It does not alter your normal Git index or switch your working branch." -ForegroundColor Gray
    Write-Host "Nothing is committed or pushed until you type: PUSH MAIN" -ForegroundColor Yellow
    Write-Host "INPUT, Old workbooks, Excel/SAP source files, .env, and private keys are blocked." -ForegroundColor Yellow

    Set-Location -LiteralPath $RepoRoot
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw "Git is not installed or is not available in PATH." }
    $inside = ((Run-Git @("rev-parse", "--is-inside-work-tree")) -join "").Trim()
    if ($inside -ne "true") { throw "$RepoRoot is not a Git repository." }
    $remote = ((Run-Git @("remote", "get-url", "origin")) -join "").Trim()
    Write-Host ""
    Write-Host "Repository: $RepoRoot" -ForegroundColor DarkGray
    Write-Host "Remote:     $remote" -ForegroundColor DarkGray
    Write-Host "Target:     origin/main" -ForegroundColor DarkGray

    if (Test-Path -LiteralPath $TempIndex) { Remove-Item -LiteralPath $TempIndex -Force }

    Write-Host ""
    Write-Host "Reading the current GitHub main branch..." -ForegroundColor Cyan
    # The repository is public, so preview/fetch must still work if a stale token
    # happens to exist in the environment. The token is reserved for the push.
    Run-Git @("fetch", "--quiet", "origin", "main") | Out-Null

    # Candidate paths come only from the user's real working-tree changes.
    # Remote-only files are therefore preserved even when the local branch is behind.
    $trackedChanges = @(Run-Git @("diff", "--name-only", "HEAD", "--"))
    $untrackedChanges = @(Run-Git @("ls-files", "--others", "--exclude-standard"))
    $allPaths = @($trackedChanges + $untrackedChanges | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique)
    $blocked = @($allPaths | Where-Object { ($_ -replace '\\','/') -match $BlockedPattern })
    $allowedPaths = @($allPaths | Where-Object { $blocked -notcontains $_ })

    $env:GIT_INDEX_FILE = $TempIndex
    Run-Git @("read-tree", "origin/main") | Out-Null
    if ($blocked.Count -gt 0) {
        Write-Title "BLOCKED LOCAL-ONLY FILES - THESE WILL NOT BE UPLOADED"
        $blocked | ForEach-Object { Write-Host "BLOCKED  $_" -ForegroundColor Yellow }
    }
    if ($allowedPaths.Count -gt 0) { Run-Git (@("add", "-A", "--") + $allowedPaths) | Out-Null }

    $candidates = @(Get-CandidatePaths)
    if ($candidates.Count -eq 0) {
        Write-Host ""
        Write-Host "Nothing is different from GitHub origin/main after safety exclusions." -ForegroundColor Green
        exit 0
    }

    Show-Preview "AVAILABLE CHANGES COMPARED WITH GITHUB MAIN"
    Write-Host ""
    for ($i = 0; $i -lt $candidates.Count; $i++) {
        Write-Host ("{0,3} - {1}" -f ($i + 1), $candidates[$i]) -ForegroundColor Gray
    }

    Write-Host ""
    Write-Host "A = include every listed change" -ForegroundColor Cyan
    Write-Host "S = select file numbers" -ForegroundColor Cyan
    Write-Host "Q = exit without changing GitHub" -ForegroundColor Cyan
    $choice = (Read-Host "Choose").Trim().ToUpperInvariant()
    if ($choice -eq "Q") { Write-Host "Cancelled. Nothing was committed or pushed." -ForegroundColor Yellow; exit 0 }

    if ($choice -eq "S") {
        $raw = Read-Host "Enter numbers separated by commas, for example 1,3,7"
        $indexes = @($raw -split ',' | ForEach-Object {
            $number = 0
            if (-not [int]::TryParse($_.Trim(), [ref]$number) -or $number -lt 1 -or $number -gt $candidates.Count) {
                throw "Invalid selection: $_"
            }
            $number - 1
        } | Select-Object -Unique)
        $selected = @($indexes | ForEach-Object { $candidates[$_] })
        Run-Git @("read-tree", "origin/main") | Out-Null
        Run-Git (@("add", "-A", "--") + $selected) | Out-Null
    } elseif ($choice -ne "A") {
        throw "Invalid choice. Use A, S, or Q."
    }

    $selectedPaths = @(Get-CandidatePaths)
    if ($selectedPaths.Count -eq 0) { throw "No files are selected for the commit." }
    Show-Preview "EXACT COMMIT CONTENT - THIS IS WHAT WILL REACH GITHUB"

    $defaultMessage = "chore: update CTO CostControl main"
    $message = Read-Host "Commit message [$defaultMessage]"
    if ([string]::IsNullOrWhiteSpace($message)) { $message = $defaultMessage }

    Write-Host ""
    Write-Host "Target branch: GitHub origin/main" -ForegroundColor Yellow
    Write-Host "Commit message: $message" -ForegroundColor Yellow
    Write-Host "Files: $($selectedPaths.Count)" -ForegroundColor Yellow
    $approval = Read-Host "Type PUSH MAIN exactly to commit and push"
    if ($approval -cne "PUSH MAIN") {
        Write-Host "Approval not received. Nothing was committed or pushed." -ForegroundColor Yellow
        exit 0
    }

    $userName = ((& git config user.name 2>$null) -join "").Trim()
    $userEmail = ((& git config user.email 2>$null) -join "").Trim()
    if ([string]::IsNullOrWhiteSpace($userName)) {
        $userName = (Read-Host "Git author name").Trim()
        if ([string]::IsNullOrWhiteSpace($userName)) { throw "Git author name is required." }
        Run-Git @("config", "user.name", $userName) | Out-Null
    }
    if ([string]::IsNullOrWhiteSpace($userEmail)) {
        $userEmail = (Read-Host "Git author email").Trim()
        if ([string]::IsNullOrWhiteSpace($userEmail)) { throw "Git author email is required." }
        Run-Git @("config", "user.email", $userEmail) | Out-Null
    }

    $tree = ((Run-Git @("write-tree")) -join "").Trim()
    $parent = ((Run-Git @("rev-parse", "origin/main")) -join "").Trim()
    $commit = ((Run-Git @("commit-tree", $tree, "-p", $parent, "-m", $message)) -join "").Trim()

    Write-Host ""
    Write-Host "Pushing approved commit to GitHub main..." -ForegroundColor Cyan
    Run-Git @("push", "origin", "${commit}:refs/heads/main") -Network | ForEach-Object { Write-Host $_ }

    $remoteLine = ((Run-Git @("ls-remote", "origin", "refs/heads/main") -Network) -join "`n").Trim()
    $remoteCommit = ($remoteLine -split '\s+')[0]
    if ($remoteCommit -ne $commit) {
        throw "GitHub verification failed. Expected $commit but origin/main reports $remoteCommit."
    }

    Write-Title "VERIFIED SUCCESS"
    Write-Host "GitHub origin/main now contains the approved commit." -ForegroundColor Green
    Write-Host "Commit: $commit" -ForegroundColor Green
    Write-Host "Files committed: $($selectedPaths.Count)" -ForegroundColor Green
    Write-Host "The normal working tree and normal Git index were not changed by this tool." -ForegroundColor Gray
}
catch {
    Write-Title "STOPPED - NOTHING ELSE WILL BE PUSHED"
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "If the push step had already started, check the VERIFIED SUCCESS section; only that section confirms GitHub." -ForegroundColor Yellow
}
finally {
    if ([string]::IsNullOrEmpty($OriginalIndex)) { Remove-Item Env:GIT_INDEX_FILE -ErrorAction SilentlyContinue } else { $env:GIT_INDEX_FILE = $OriginalIndex }
    if (Test-Path -LiteralPath $TempIndex) { Remove-Item -LiteralPath $TempIndex -Force -ErrorAction SilentlyContinue }
    Write-Host ""
    Write-Host "You may close this PowerShell window when finished." -ForegroundColor DarkGray
}
