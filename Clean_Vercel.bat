@echo off
setlocal EnableExtensions DisableDelayedExpansion
title CTO CostControl - Interactive Clean Vercel
cd /d "%~dp0"

set "CLEAN_VERCEL_SCRIPT=%~f0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $raw=[IO.File]::ReadAllText($env:CLEAN_VERCEL_SCRIPT); $marker='# POWERSHELL-PAYLOAD-START'; $pos=$raw.LastIndexOf($marker); if($pos -lt 0){throw 'PowerShell payload marker not found.'}; & ([ScriptBlock]::Create($raw.Substring($pos+$marker.Length)))"
set "RESULT=%ERRORLEVEL%"
if not "%RESULT%"=="0" (
  echo.
  echo Clean_Vercel stopped with an error.
  pause
)
exit /b %RESULT%

# POWERSHELL-PAYLOAD-START
$ErrorActionPreference = "Stop"
$GitHubOwner = "ahmedlabib33-boop"
$GitHubRepo = "CTO-CostControl"
$GitHubBranch = "main"
$VercelUrl = "https://cto-cost-control.vercel.app"
$RepoRoot = [IO.Path]::GetFullPath((Get-Location).Path)
$GeneratedRoot = [IO.Path]::GetFullPath((Join-Path $RepoRoot "public\generated"))
$ProjectsRoot = [IO.Path]::GetFullPath((Join-Path $GeneratedRoot "projects"))
$ProjectsIndex = Join-Path $GeneratedRoot "projects.json"
$PortfolioIndex = Join-Path $GeneratedRoot "portfolio\latest.json"
$IdentityIndex = Join-Path $GeneratedRoot "identity-registry.json"
$InputRoot = [IO.Path]::GetFullPath((Join-Path $RepoRoot "INPUT"))
$WatcherStatePath = Join-Path $RepoRoot ".runtime\watcher-state.json"
$BackupRoot = Join-Path $RepoRoot ".runtime\clean-vercel-backup"
$TokenFilePath = Join-Path $RepoRoot ".runtime\github-token.txt"
$Utf8NoBom = [Text.UTF8Encoding]::new($false)
$script:Token = $env:GITHUB_TOKEN

if (-not $script:Token -and (Test-Path -LiteralPath $TokenFilePath -PathType Leaf)) {
    $storedToken = (Get-Content -LiteralPath $TokenFilePath -Raw).Trim()
    if ($storedToken -and $storedToken -ne "PASTE_GITHUB_TOKEN_HERE") {
        $script:Token = $storedToken
    }
}

function Read-JsonFile([string]$Path, $Default = $null) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $Default }
    try { return Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json }
    catch { throw "Invalid JSON file: $Path" }
}

function Write-JsonFile([string]$Path, $Value) {
    $parent = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $parent)) { [void](New-Item -ItemType Directory -Path $parent -Force) }
    [IO.File]::WriteAllText($Path, (ConvertTo-Json -InputObject $Value -Depth 100) + [Environment]::NewLine, $Utf8NoBom)
}

function Get-Sha256Text([string]$Text) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return -join ($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Text)) | ForEach-Object { $_.ToString("x2") }) }
    finally { $sha.Dispose() }
}

function Get-GitHubToken {
    if ($script:Token) { return $script:Token }
    Write-Host ""
    Write-Host "GitHub token is required only to publish the deletion." -ForegroundColor Yellow
    Write-Host "You can save it once in: $TokenFilePath" -ForegroundColor DarkGray
    $secure = Read-Host "Paste GITHUB_TOKEN (input is hidden)" -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $script:Token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
    if (-not $script:Token) { throw "No GitHub token was entered." }
    return $script:Token
}

function Get-GitHubHeaders {
    return @{
        Authorization = "Bearer $(Get-GitHubToken)"
        Accept = "application/vnd.github+json"
        "X-GitHub-Api-Version" = "2022-11-28"
        "User-Agent" = "CTO-CostControl-Clean-Vercel"
    }
}

function Assert-GitHubAuthorization {
    $headers = Get-GitHubHeaders
    $api = "https://api.github.com/repos/$GitHubOwner/$GitHubRepo"
    try {
        $repository = Invoke-RestMethod -Headers $headers -Uri $api -TimeoutSec 20
        [void](Invoke-RestMethod -Headers $headers -Uri "$api/git/ref/heads/$GitHubBranch" -TimeoutSec 20)
        if ($repository.permissions -and $repository.permissions.push -eq $false) {
            throw "The token can read the repository but cannot write repository contents."
        }
    }
    catch {
        $statusCode = 0
        try { $statusCode = [int]$_.Exception.Response.StatusCode } catch { }
        if ($statusCode -eq 401) {
            throw "GitHub rejected the token before cleaning (401 Unauthorized). NOTHING WAS DELETED. Set a valid fine-grained token with Contents: Read and write, then run Clean_Vercel.bat again."
        }
        if ($statusCode -eq 403) {
            throw "GitHub refused repository write access before cleaning (403 Forbidden). NOTHING WAS DELETED. Check token repository access and Contents: Read and write."
        }
        throw "GitHub authorization preflight failed before cleaning. NOTHING WAS DELETED. $($_.Exception.Message)"
    }
    Write-Host "GitHub authorization confirmed before local cleaning." -ForegroundColor Green
}

function Backup-CleanTransaction([string]$RunBackupRoot) {
    $snapshotRoot = Join-Path $RunBackupRoot "LOCAL_STATE"
    [void](New-Item -ItemType Directory -Path $snapshotRoot -Force)
    if (Test-Path -LiteralPath $GeneratedRoot -PathType Container) {
        Copy-Item -LiteralPath $GeneratedRoot -Destination (Join-Path $snapshotRoot "generated") -Recurse -Force
    }
    if (Test-Path -LiteralPath $WatcherStatePath -PathType Leaf) {
        Copy-Item -LiteralPath $WatcherStatePath -Destination (Join-Path $snapshotRoot "watcher-state.json") -Force
    }
}

function Restore-CleanTransaction([string]$RunBackupRoot) {
    $snapshotRoot = Join-Path $RunBackupRoot "LOCAL_STATE"
    $generatedSnapshot = Join-Path $snapshotRoot "generated"
    if (Test-Path -LiteralPath $generatedSnapshot -PathType Container) {
        [void](New-Item -ItemType Directory -Path $GeneratedRoot -Force)
        Copy-Item -Path (Join-Path $generatedSnapshot "*") -Destination $GeneratedRoot -Recurse -Force
    }
    $watcherSnapshot = Join-Path $snapshotRoot "watcher-state.json"
    if (Test-Path -LiteralPath $watcherSnapshot -PathType Leaf) {
        [void](New-Item -ItemType Directory -Path (Split-Path -Parent $WatcherStatePath) -Force)
        Copy-Item -LiteralPath $watcherSnapshot -Destination $WatcherStatePath -Force
    }
    $inputSnapshot = Join-Path $RunBackupRoot "INPUT"
    $restoredInputFiles = 0
    if (Test-Path -LiteralPath $inputSnapshot -PathType Container) {
        foreach ($file in Get-ChildItem -LiteralPath $inputSnapshot -Recurse -File) {
            $relative = $file.FullName.Substring($inputSnapshot.TrimEnd('\').Length).TrimStart([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
            $destination = Join-Path $InputRoot $relative
            [void](New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force)
            Copy-Item -LiteralPath $file.FullName -Destination $destination -Force -ErrorAction Stop
            if (-not (Test-Path -LiteralPath $destination -PathType Leaf) -or (Get-Item -LiteralPath $destination).Length -ne $file.Length) {
                throw "Rollback could not verify restored INPUT file: $destination. Recovery copy remains at $RunBackupRoot"
            }
            $restoredInputFiles++
        }
    }
    Write-Host "LOCAL ROLLBACK COMPLETED: generated JSON, watcher memory, and $restoredInputFiles INPUT source file(s) were restored and verified." -ForegroundColor Yellow
}

function Get-AvailableProjects {
    $items = [ordered]@{}
    # Windows PowerShell 5.1 can return a top-level JSON array as one nested
    # pipeline object. Enumerate it explicitly so two projects can never be
    # cast into one synthetic "project-a project-b" menu entry.
    $registry = Read-JsonFile $ProjectsIndex @()
    foreach ($item in @($registry | ForEach-Object { $_ })) {
        $id = [string]$item.project_id
        if ($id) {
            $items[$id] = [pscustomobject]@{ project_id=$id; project_name=$(if($item.project_name){[string]$item.project_name}else{$id}); source_file=$null }
        }
    }
    if (Test-Path -LiteralPath $ProjectsRoot -PathType Container) {
        foreach ($directory in Get-ChildItem -LiteralPath $ProjectsRoot -Directory) {
            $id = $directory.Name
            $latest = Read-JsonFile (Join-Path $directory.FullName "latest.json") $null
            $name = if ($latest.project_name) { [string]$latest.project_name } else { $id }
            $source = if ($latest.source.filename) { [string]$latest.source.filename } else { $null }
            if ($items.Contains($id)) { $items[$id].source_file = $source }
            else { $items[$id] = [pscustomobject]@{ project_id=$id; project_name=$name; source_file=$source } }
        }
    }
    return @($items.Values | Sort-Object project_name, project_id)
}

function Get-InputWorkbooks {
    if (-not (Test-Path -LiteralPath $InputRoot -PathType Container)) { return @() }
    return @(Get-ChildItem -LiteralPath $InputRoot -Recurse -File | Where-Object {
        $_.Extension.ToLowerInvariant() -in @(".xlsx", ".xlsm", ".otf", ".xsf", ".xdf", ".xml", ".html", ".htm") -and -not $_.Name.StartsWith("~$")
    })
}

function Get-StateProjectPaths([string]$ProjectId) {
    $state = Read-JsonFile $WatcherStatePath $null
    if (-not $state -or -not $state.files) { return @() }
    return @($state.files.PSObject.Properties | Where-Object { [string]$_.Value.project_id -eq $ProjectId } | ForEach-Object { [string]$_.Name })
}

function Backup-InputFiles([System.IO.FileInfo[]]$Files, [string]$RunBackupRoot) {
    $moved = [Collections.Generic.List[string]]::new()
    foreach ($file in @($Files)) {
        if (-not $file -or -not (Test-Path -LiteralPath $file.FullName -PathType Leaf)) { continue }
        $full = [IO.Path]::GetFullPath($file.FullName)
        $prefix = $InputRoot.TrimEnd('\') + '\'
        if (-not $full.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe INPUT path rejected: $full" }
        $destination = Join-Path (Join-Path $RunBackupRoot "INPUT") $full.Substring($prefix.Length)
        [void](New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force)
        Move-Item -LiteralPath $full -Destination $destination -Force
        $moved.Add($destination)
    }
    return @($moved)
}

function Clear-WatcherState([string[]]$ProjectIds, [switch]$All) {
    $state = Read-JsonFile $WatcherStatePath $null
    if (-not $state -or -not $state.files) { return 0 }
    $removed = 0
    foreach ($property in @($state.files.PSObject.Properties)) {
        if ($All -or ([string]$property.Value.project_id -in $ProjectIds)) {
            $state.files.PSObject.Properties.Remove($property.Name)
            $removed++
        }
    }
    Write-JsonFile $WatcherStatePath $state
    return $removed
}

function Clear-WatcherStateMonth([string]$ProjectId, [string]$Period) {
    $state = Read-JsonFile $WatcherStatePath $null
    if (-not $state -or -not $state.files) { return 0 }
    $removed = 0
    foreach ($property in @($state.files.PSObject.Properties)) {
        if ([string]$property.Value.project_id -eq $ProjectId -and [string]$property.Value.period -eq $Period) {
            $state.files.PSObject.Properties.Remove($property.Name)
            $removed++
        }
    }
    Write-JsonFile $WatcherStatePath $state
    return $removed
}

function Regenerate-GlobalIndexes {
    $env:CLEAN_OUTPUT_ROOT = $GeneratedRoot
    & python -c "import os; from pathlib import Path; from watcher.xlsx_engine import regenerate_portfolio; regenerate_portfolio(Path(os.environ['CLEAN_OUTPUT_ROOT']))"
    if ($LASTEXITCODE -ne 0) { throw "Python failed to regenerate the global project indexes." }
    return Read-JsonFile $PortfolioIndex $null
}

function Set-EmptyGeneratedIndexes {
    $identity = Read-JsonFile $IdentityIndex ([pscustomobject]@{schema_version=1})
    $identity | Add-Member -NotePropertyName projects -NotePropertyValue ([object[]]@()) -Force
    $identity | Add-Member -NotePropertyName updated_at -NotePropertyValue ([DateTime]::UtcNow.ToString("o")) -Force
    Write-JsonFile $IdentityIndex $identity
    return Regenerate-GlobalIndexes
}

function Remove-OneProject([string]$ProjectId) {
    $projectPath = [IO.Path]::GetFullPath((Join-Path $ProjectsRoot $ProjectId))
    $prefix = $ProjectsRoot.TrimEnd('\') + '\'
    if (-not $projectPath.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe deletion path rejected: $projectPath" }
    if (Test-Path -LiteralPath $projectPath) { Remove-Item -LiteralPath $projectPath -Recurse -Force }
    $identity = Read-JsonFile $IdentityIndex ([pscustomobject]@{schema_version=1;projects=@()})
    $identityProjects = @(@($identity.projects) | Where-Object { [string]$_.internal_project_id -ne $ProjectId })
    $identity | Add-Member -NotePropertyName projects -NotePropertyValue $identityProjects -Force
    $identity | Add-Member -NotePropertyName updated_at -NotePropertyValue ([DateTime]::UtcNow.ToString("o")) -Force
    Write-JsonFile $IdentityIndex $identity
    return Regenerate-GlobalIndexes
}

function Remove-AllProjects {
    if (Test-Path -LiteralPath $ProjectsRoot -PathType Container) {
        foreach ($directory in Get-ChildItem -LiteralPath $ProjectsRoot -Directory) {
            $full = [IO.Path]::GetFullPath($directory.FullName)
            if (-not $full.StartsWith(($ProjectsRoot.TrimEnd('\') + '\'), [StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe deletion path rejected: $full" }
            Remove-Item -LiteralPath $full -Recurse -Force
        }
    }
    return Set-EmptyGeneratedIndexes
}

function Get-ProjectPeriods([string]$ProjectId) {
    $historyRoot = Join-Path (Join-Path $ProjectsRoot $ProjectId) "history"
    if (-not (Test-Path -LiteralPath $historyRoot -PathType Container)) { return @() }
    return @(Get-ChildItem -LiteralPath $historyRoot -Directory | Where-Object {
        Test-Path -LiteralPath (Join-Path $_.FullName "latest.json") -PathType Leaf
    } | Sort-Object Name)
}

function Remove-OneMonth([string]$ProjectId, [string]$Period) {
    $projectRoot = [IO.Path]::GetFullPath((Join-Path $ProjectsRoot $ProjectId))
    $projectPrefix = $ProjectsRoot.TrimEnd('\') + '\'
    if (-not $projectRoot.StartsWith($projectPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe project path rejected: $projectRoot" }
    $periodPath = [IO.Path]::GetFullPath((Join-Path (Join-Path $projectRoot "history") $Period))
    $historyPrefix = (Join-Path $projectRoot "history").TrimEnd('\') + '\'
    if (-not $periodPath.StartsWith($historyPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe month path rejected: $periodPath" }
    if (-not (Test-Path -LiteralPath $periodPath -PathType Container)) { throw "Reporting month was not found: $Period" }

    Remove-Item -LiteralPath $periodPath -Recurse -Force
    foreach ($kind in @("raw", "enriched")) {
        $detailPath = Join-Path (Join-Path $projectRoot $kind) $Period
        if (Test-Path -LiteralPath $detailPath) { Remove-Item -LiteralPath $detailPath -Recurse -Force }
    }

    $remaining = @(Get-ProjectPeriods $ProjectId)
    if ($remaining.Count -eq 0) { return Remove-OneProject $ProjectId }

    $newest = $remaining[-1]
    $newLatestPath = Join-Path $newest.FullName "latest.json"
    Copy-Item -LiteralPath $newLatestPath -Destination (Join-Path $projectRoot "latest.json") -Force
    $newLatest = Read-JsonFile $newLatestPath $null

    $identity = Read-JsonFile $IdentityIndex ([pscustomobject]@{schema_version=1;projects=@()})
    foreach ($entry in @($identity.projects)) {
        if ([string]$entry.internal_project_id -eq $ProjectId) {
            $entry.latest_processed_reporting_period = [string]$newLatest.reporting_period
            $entry.latest_validated_source_fingerprint = [string]$newLatest.source.sha256
        }
    }
    $identity | Add-Member -NotePropertyName updated_at -NotePropertyValue ([DateTime]::UtcNow.ToString("o")) -Force
    Write-JsonFile $IdentityIndex $identity

    return Regenerate-GlobalIndexes
}

function Publish-GeneratedDataToGitHub([string]$CommitMessage, [string]$DeleteProjectId = "", [string]$DeletePeriod = "", [switch]$MirrorGenerated) {
    $publisher = Join-Path $RepoRoot "tools\publish_generated_delta.ps1"
    if (-not (Test-Path -LiteralPath $publisher -PathType Leaf)) { throw "Changed-only publisher was not found: $publisher" }
    Write-Host "Publishing only changed generated files and deliberate deletions to GitHub..." -ForegroundColor Cyan
    $arguments = @("-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $publisher, "-RepoRoot", $RepoRoot, "-Owner", $GitHubOwner, "-Repository", $GitHubRepo, "-Branch", $GitHubBranch, "-CommitMessage", $CommitMessage)
    if ($MirrorGenerated) { $arguments += "-MirrorGenerated" }
    elseif ($DeleteProjectId) {
        $arguments += @("-DeleteProjectId", $DeleteProjectId)
        if ($DeletePeriod) { $arguments += @("-DeletePeriod", $DeletePeriod) }
    }
    # Pass the already validated token explicitly to the child process and keep
    # its complete output. This prevents a generic exit code from hiding the
    # real GitHub or Git preflight reason during a rollback.
    $previousToken = $env:GITHUB_TOKEN
    $env:GITHUB_TOKEN = $script:Token
    try {
        $publisherOutput = @(& powershell.exe @arguments 2>&1)
        $publisherExit = $LASTEXITCODE
    }
    finally {
        $env:GITHUB_TOKEN = $previousToken
    }
    $publisherOutput | ForEach-Object { Write-Host $_ }
    if ($publisherExit -ne 0) {
        $details = ($publisherOutput | ForEach-Object { [string]$_ }) -join [Environment]::NewLine
        throw "Changed-only GitHub publisher failed with exit code $publisherExit. $details"
    }
    $headers = Get-GitHubHeaders
    $api = "https://api.github.com/repos/$GitHubOwner/$GitHubRepo"
    $ref = Invoke-RestMethod -Headers $headers -Uri "$api/git/ref/heads/$GitHubBranch" -TimeoutSec 20
    return [pscustomobject]@{changed=$true;commit_sha=[string]$ref.object.sha}
}

function Get-HttpStatus([string]$Url) {
    try { return [int](Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 15).StatusCode }
    catch { if ($_.Exception.Response -and $_.Exception.Response.StatusCode) { return [int]$_.Exception.Response.StatusCode }; return 0 }
}

function Confirm-Vercel([int]$ExpectedCount,[string]$ExpectedFingerprint,[string]$RemovedProjectId=$null) {
    Write-Host "Waiting for Vercel and verifying the live result..." -ForegroundColor Cyan
    for ($attempt=1; $attempt -le 36; $attempt++) {
        $nonce=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        try {
            $health=Invoke-RestMethod -Uri "$VercelUrl/api/health?t=$nonce" -Headers @{"Cache-Control"="no-cache"} -TimeoutSec 15
            $live=@(Invoke-RestMethod -Uri "$VercelUrl/generated/projects.json?t=$nonce" -Headers @{"Cache-Control"="no-cache"} -TimeoutSec 15)
            $absent=$true
            if($RemovedProjectId){
                $absent=@($live|Where-Object{[string]$_.project_id -eq $RemovedProjectId}).Count -eq 0
                $encoded=[Uri]::EscapeDataString($RemovedProjectId)
                $absent=$absent -and ((Get-HttpStatus "$VercelUrl/generated/projects/$encoded/latest.json?t=$nonce") -eq 404)
            }
            if($health.ok -and [int]$health.project_count -eq $ExpectedCount -and [string]$health.registry_fingerprint -eq $ExpectedFingerprint -and $absent){return $true}
        } catch {}
        Start-Sleep -Seconds 5
    }
    return $false
}

function Invoke-OneProjectClean($Project) {
    $statePaths=@(Get-StateProjectPaths $Project.project_id)
    $files=@(Get-InputWorkbooks|Where-Object{$_.FullName -in $statePaths -or ($Project.source_file -and $_.Name -eq $Project.source_file)})
    Write-Host ""
    Write-Host "Selected: $($Project.project_name) [$($Project.project_id)]" -ForegroundColor Yellow
    Write-Host "Generated data: DELETE | Watcher memory: CLEAR | Matching INPUT files: $($files.Count)" -ForegroundColor Yellow
    $files|ForEach-Object{Write-Host "  $($_.FullName)" -ForegroundColor DarkYellow}
    if((Read-Host "Type CLEAN to continue").Trim() -cne "CLEAN"){Write-Host "Cancelled. Nothing changed." -ForegroundColor DarkYellow;return}
    Assert-GitHubAuthorization
    $runBackup=Join-Path $BackupRoot "$([DateTime]::Now.ToString('yyyyMMdd-HHmmss'))-$($Project.project_id)"
    Backup-CleanTransaction $runBackup
    try {
        $moved=@(Backup-InputFiles $files $runBackup)
        $stateRemoved=Clear-WatcherState @($Project.project_id)
        $portfolio=Remove-OneProject $Project.project_id
        $published=Publish-GeneratedDataToGitHub "chore(data): fully clean project $($Project.project_id)" $Project.project_id
    }
    catch {
        Restore-CleanTransaction $runBackup
        throw "Clean was cancelled because publishing failed; local data was restored. $($_.Exception.Message)"
    }
    Write-Host "Local generated data deleted. Watcher entries removed: $stateRemoved" -ForegroundColor Green
    if($moved.Count){Write-Host "INPUT backup: $runBackup" -ForegroundColor Green}
    Write-Host "GitHub commit: $($published.commit_sha)" -ForegroundColor Green
    if(Confirm-Vercel ([int]$portfolio.project_count) ([string]$portfolio.registry_fingerprint) $Project.project_id){
        Write-Host "CONFIRMED: project is absent from Vercel. Live projects: $($portfolio.project_count)" -ForegroundColor Green
    }else{Write-Host "NOT CONFIRMED: Vercel did not match within 3 minutes." -ForegroundColor Red}
}

function Invoke-OneMonthClean($Project) {
    $periods = @(Get-ProjectPeriods $Project.project_id)
    if ($periods.Count -eq 0) { Write-Host "This project has no reporting months." -ForegroundColor Yellow; return }
    Write-Host ""
    Write-Host "Reporting months for $($Project.project_name):" -ForegroundColor Cyan
    for ($i=0; $i -lt $periods.Count; $i++) { Write-Host ("{0} - {1}" -f ($i+1), $periods[$i].Name) }
    $choice = (Read-Host "Choose a month number, or B to go back").Trim()
    if ($choice.ToUpperInvariant() -eq "B") { return }
    $number = 0
    if (-not [int]::TryParse($choice,[ref]$number) -or $number -lt 1 -or $number -gt $periods.Count) {
        Write-Host "Invalid month choice." -ForegroundColor Red
        return
    }
    $period = $periods[$number-1].Name
    $periodLatest = Read-JsonFile (Join-Path $periods[$number-1].FullName "latest.json") $null
    $sourceFile = if ($periodLatest.source.filename) { [string]$periodLatest.source.filename } else { $null }
    $state = Read-JsonFile $WatcherStatePath $null
    $statePaths = @()
    if ($state -and $state.files) {
        $statePaths = @($state.files.PSObject.Properties | Where-Object {
            [string]$_.Value.project_id -eq $Project.project_id -and [string]$_.Value.period -eq $period
        } | ForEach-Object { [string]$_.Name })
    }
    $files = @(Get-InputWorkbooks | Where-Object { $_.FullName -in $statePaths -or ($sourceFile -and $_.Name -eq $sourceFile) })
    Write-Host ""
    Write-Host "REMOVE MONTH: $period from $($Project.project_name)" -ForegroundColor Yellow
    Write-Host "Only this month's history, raw JSON, enriched JSON and matching watcher memory will be removed." -ForegroundColor Yellow
    Write-Host "Matching INPUT workbooks: $($files.Count) (they will be backed up)" -ForegroundColor Yellow
    if ((Read-Host "Type CLEAN MONTH to continue").Trim() -cne "CLEAN MONTH") { Write-Host "Cancelled. Nothing changed." -ForegroundColor DarkYellow; return }
    Assert-GitHubAuthorization
    $runBackup = Join-Path $BackupRoot "$([DateTime]::Now.ToString('yyyyMMdd-HHmmss'))-$($Project.project_id)-$Period"
    Backup-CleanTransaction $runBackup
    try {
        $moved = @(Backup-InputFiles $files $runBackup)
        $stateRemoved = Clear-WatcherStateMonth $Project.project_id $Period
        $portfolio = Remove-OneMonth $Project.project_id $Period
        $published = Publish-GeneratedDataToGitHub "chore(data): remove $Period from $($Project.project_id)" $Project.project_id $Period
    }
    catch {
        Restore-CleanTransaction $runBackup
        throw "Month clean was cancelled because publishing failed; local data was restored. $($_.Exception.Message)"
    }
    Write-Host "Month removed. Watcher entries removed: $stateRemoved" -ForegroundColor Green
    if ($moved.Count) { Write-Host "INPUT backup: $runBackup" -ForegroundColor Green }
    Write-Host "GitHub commit: $($published.commit_sha)" -ForegroundColor Green
    if (Confirm-Vercel ([int]$portfolio.project_count) ([string]$portfolio.registry_fingerprint)) {
        Write-Host "CONFIRMED: Vercel published the project without $Period." -ForegroundColor Green
    } else { Write-Host "NOT CONFIRMED: Vercel did not match within 3 minutes." -ForegroundColor Red }
}

function Open-ProjectMenu($Project) {
    while ($true) {
        Write-Host ""
        Write-Host "$($Project.project_name) [$($Project.project_id)]" -ForegroundColor Cyan
        Write-Host "1 = clean the entire project"
        Write-Host "2 = remove one reporting month"
        Write-Host "B = back to project list"
        $choice = (Read-Host "Choose").Trim()
        if ($choice.ToUpperInvariant() -eq "B") { return }
        if ($choice -eq "1") { Invoke-OneProjectClean $Project; return }
        if ($choice -eq "2") { Invoke-OneMonthClean $Project; return }
        Write-Host "Invalid choice." -ForegroundColor Red
    }
}

function Invoke-AllProjectsClean {
    $files=@(Get-InputWorkbooks)
    Write-Host ""
    Write-Host "TOTAL CLEAN: all generated projects, all watcher memory, and all $($files.Count) INPUT workbooks." -ForegroundColor Red
    if((Read-Host "Type CLEAN ALL to continue").Trim() -cne "CLEAN ALL"){Write-Host "Cancelled. Nothing changed." -ForegroundColor DarkYellow;return}
    Assert-GitHubAuthorization
    $runBackup=Join-Path $BackupRoot "$([DateTime]::Now.ToString('yyyyMMdd-HHmmss'))-ALL"
    Backup-CleanTransaction $runBackup
    try {
        $moved=@(Backup-InputFiles $files $runBackup)
        $stateRemoved=Clear-WatcherState @() -All
        $portfolio=Remove-AllProjects
        $published=Publish-GeneratedDataToGitHub "chore(data): fully clean all generated projects" -MirrorGenerated
    }
    catch {
        Restore-CleanTransaction $runBackup
        throw "Total clean was cancelled because publishing failed; local data was restored. $($_.Exception.Message)"
    }
    Write-Host "All local generated projects deleted. Watcher entries removed: $stateRemoved" -ForegroundColor Green
    if($moved.Count){Write-Host "INPUT backup: $runBackup" -ForegroundColor Green}
    Write-Host "GitHub commit: $($published.commit_sha)" -ForegroundColor Green
    if(Confirm-Vercel 0 ([string]$portfolio.registry_fingerprint)){
        Write-Host "CONFIRMED: Vercel shows 0 PROJECTS - NO PROJECT DATA." -ForegroundColor Green
    }else{Write-Host "NOT CONFIRMED: Vercel did not show zero within 3 minutes." -ForegroundColor Red}
}

function Invoke-MoveInputWorkbook {
    $files = @(Get-InputWorkbooks)
    if ($files.Count -eq 0) {
        Write-Host "INPUT contains no supported Excel or SAP form source files." -ForegroundColor Yellow
        return
    }
    Write-Host ""
    Write-Host "MOVE SOURCE FILE OUT OF INPUT" -ForegroundColor Cyan
    for ($i=0; $i -lt $files.Count; $i++) {
        Write-Host ("{0} - {1}" -f ($i+1), $files[$i].FullName)
    }
    Write-Host "A = move every source | B = back"
    $choice = (Read-Host "Choose").Trim()
    if ($choice.ToUpperInvariant() -eq "B") { return }
    $selected = @()
    if ($choice.ToUpperInvariant() -eq "A") {
        $selected = $files
    }
    else {
        $number = 0
        if (-not [int]::TryParse($choice,[ref]$number) -or $number -lt 1 -or $number -gt $files.Count) {
            Write-Host "Invalid source choice." -ForegroundColor Red
            return
        }
        $selected = @($files[$number-1])
    }
    Write-Host ""
    $selected | ForEach-Object { Write-Host "MOVE: $($_.FullName)" -ForegroundColor Yellow }
    if ((Read-Host "Type MOVE to remove from INPUT and place in backup").Trim() -cne "MOVE") {
        Write-Host "Cancelled. Nothing moved." -ForegroundColor DarkYellow
        return
    }
    $runBackup = Join-Path $BackupRoot "$([DateTime]::Now.ToString('yyyyMMdd-HHmmss'))-MOVED"
    $moved = @(Backup-InputFiles $selected $runBackup)
    Write-Host "MOVED $($moved.Count) source file(s) out of INPUT." -ForegroundColor Green
    Write-Host "New location: $runBackup\INPUT" -ForegroundColor Green
    Write-Host "No generated JSON, GitHub data, or Vercel data was changed by this MOVE option." -ForegroundColor Cyan
}

if(-not(Test-Path -LiteralPath $GeneratedRoot -PathType Container)){throw "Generated data folder not found: $GeneratedRoot"}
if(-not(Test-Path -LiteralPath $InputRoot -PathType Container)){[void](New-Item -ItemType Directory -Path $InputRoot -Force)}

Write-Host ""
$PinnedMessage = "Eng. Ola said this is a SAP file… and yeah, it’s painfully obvious that it actually is 😒 but I still love her 😂❤️"
$Host.UI.RawUI.WindowTitle = $PinnedMessage
Write-Host $PinnedMessage -ForegroundColor Magenta
Write-Host ""
Write-Host "CTO COSTCONTROL - INTERACTIVE CLEAN" -ForegroundColor Cyan
Write-Host "The menu remains open after each operation. INPUT files are backed up, not destroyed." -ForegroundColor DarkGray
while($true){
    $projects=@(Get-AvailableProjects)
    Write-Host ""
    Write-Host "Current generated projects: $($projects.Count)" -ForegroundColor Cyan
    for($i=0;$i -lt $projects.Count;$i++){Write-Host ("{0} - {1} [{2}]" -f ($i+1),$projects[$i].project_name,$projects[$i].project_id)}
    Write-Host ""
    Write-Host "NUMBER = project options | M = move source out of INPUT | A = clean ALL | R = refresh | EXIT = close"
    $choice=(Read-Host "Choose").Trim()
    if($choice.ToLowerInvariant() -eq "exit"){break}
    if($choice.ToUpperInvariant() -eq "R"){continue}
    if($choice.ToUpperInvariant() -eq "M"){try{Invoke-MoveInputWorkbook}catch{Write-Host "FAILED: $($_.Exception.Message)" -ForegroundColor Red};continue}
    if($choice.ToUpperInvariant() -eq "A"){try{Invoke-AllProjectsClean}catch{Write-Host "FAILED: $($_.Exception.Message)" -ForegroundColor Red};continue}
    $number=0
    if([int]::TryParse($choice,[ref]$number) -and $number -ge 1 -and $number -le $projects.Count){
        try{Open-ProjectMenu $projects[$number-1]}catch{Write-Host "FAILED: $($_.Exception.Message)" -ForegroundColor Red}
    }else{Write-Host "Invalid choice." -ForegroundColor Red}
}
Write-Host "Clean_Vercel closed." -ForegroundColor Cyan
exit 0
