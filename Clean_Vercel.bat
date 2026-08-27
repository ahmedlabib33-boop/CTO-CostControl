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
$Utf8NoBom = [Text.UTF8Encoding]::new($false)
$script:Token = $env:GITHUB_TOKEN

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
    $secure = Read-Host "Paste GITHUB_TOKEN (input is hidden)" -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $script:Token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
    if (-not $script:Token) { throw "No GitHub token was entered." }
    return $script:Token
}

function Get-AvailableProjects {
    $items = [ordered]@{}
    foreach ($item in @(Read-JsonFile $ProjectsIndex @())) {
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

function Set-EmptyGeneratedIndexes {
    Write-JsonFile $ProjectsIndex @()
    $portfolio = Read-JsonFile $PortfolioIndex ([pscustomobject]@{})
    $portfolio | Add-Member -NotePropertyName projects -NotePropertyValue @() -Force
    $portfolio | Add-Member -NotePropertyName project_count -NotePropertyValue 0 -Force
    $portfolio | Add-Member -NotePropertyName generated_at -NotePropertyValue ([DateTime]::UtcNow.ToString("o")) -Force
    $portfolio | Add-Member -NotePropertyName registry_fingerprint -NotePropertyValue (Get-Sha256Text "[]") -Force
    Write-JsonFile $PortfolioIndex $portfolio
    $identity = Read-JsonFile $IdentityIndex ([pscustomobject]@{schema_version=1})
    $identity | Add-Member -NotePropertyName projects -NotePropertyValue @() -Force
    $identity | Add-Member -NotePropertyName updated_at -NotePropertyValue ([DateTime]::UtcNow.ToString("o")) -Force
    Write-JsonFile $IdentityIndex $identity
    return $portfolio
}

function Remove-OneProject([string]$ProjectId) {
    $projectPath = [IO.Path]::GetFullPath((Join-Path $ProjectsRoot $ProjectId))
    $prefix = $ProjectsRoot.TrimEnd('\') + '\'
    if (-not $projectPath.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe deletion path rejected: $projectPath" }
    if (Test-Path -LiteralPath $projectPath) { Remove-Item -LiteralPath $projectPath -Recurse -Force }
    $remaining = @(@(Read-JsonFile $ProjectsIndex @()) | Where-Object { [string]$_.project_id -ne $ProjectId })
    Write-JsonFile $ProjectsIndex $remaining
    $portfolio = Read-JsonFile $PortfolioIndex ([pscustomobject]@{})
    $portfolioProjects = @(@($portfolio.projects) | Where-Object { [string]$_.project_id -ne $ProjectId })
    $portfolio | Add-Member -NotePropertyName projects -NotePropertyValue $portfolioProjects -Force
    $portfolio | Add-Member -NotePropertyName project_count -NotePropertyValue $portfolioProjects.Count -Force
    $portfolio | Add-Member -NotePropertyName generated_at -NotePropertyValue ([DateTime]::UtcNow.ToString("o")) -Force
    $canonical = if ($portfolioProjects.Count -eq 0) { "[]" } else { ConvertTo-Json $portfolioProjects -Depth 100 -Compress }
    $portfolio | Add-Member -NotePropertyName registry_fingerprint -NotePropertyValue (Get-Sha256Text $canonical) -Force
    Write-JsonFile $PortfolioIndex $portfolio
    $identity = Read-JsonFile $IdentityIndex ([pscustomobject]@{schema_version=1;projects=@()})
    $identityProjects = @(@($identity.projects) | Where-Object { [string]$_.internal_project_id -ne $ProjectId })
    $identity | Add-Member -NotePropertyName projects -NotePropertyValue $identityProjects -Force
    $identity | Add-Member -NotePropertyName updated_at -NotePropertyValue ([DateTime]::UtcNow.ToString("o")) -Force
    Write-JsonFile $IdentityIndex $identity
    return $portfolio
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

    $env:CLEAN_OUTPUT_ROOT = $GeneratedRoot
    & python -c "import os; from pathlib import Path; from watcher.xlsx_engine import regenerate_portfolio; regenerate_portfolio(Path(os.environ['CLEAN_OUTPUT_ROOT']))"
    if ($LASTEXITCODE -ne 0) { throw "Portfolio regeneration failed after removing $Period." }
    return Read-JsonFile $PortfolioIndex $null
}

function Publish-GeneratedDataToGitHub([string]$CommitMessage) {
    $headers = @{ Authorization="Bearer $(Get-GitHubToken)"; Accept="application/vnd.github+json"; "X-GitHub-Api-Version"="2022-11-28"; "User-Agent"="CTO-CostControl-Clean-Vercel" }
    $api = "https://api.github.com/repos/$GitHubOwner/$GitHubRepo"
    Write-Host "Publishing the cleaned generated data to GitHub..." -ForegroundColor Cyan
    $ref = Invoke-RestMethod -Headers $headers -Uri "$api/git/ref/heads/$GitHubBranch"
    $parentSha = [string]$ref.object.sha
    $parentCommit = Invoke-RestMethod -Headers $headers -Uri "$api/git/commits/$parentSha"
    $baseTreeSha = [string]$parentCommit.tree.sha
    $remoteTree = Invoke-RestMethod -Headers $headers -Uri "$api/git/trees/$baseTreeSha`?recursive=1"
    if ($remoteTree.truncated) { throw "GitHub returned a truncated repository tree." }
    $entries = [Collections.Generic.List[object]]::new()
    $localPaths = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($file in Get-ChildItem -LiteralPath $GeneratedRoot -Recurse -File) {
        $relative = $file.FullName.Substring($GeneratedRoot.Length).TrimStart('\').Replace('\','/')
        $repoPath = "public/generated/$relative"
        [void]$localPaths.Add($repoPath)
        $body = @{content=[Convert]::ToBase64String([IO.File]::ReadAllBytes($file.FullName));encoding="base64"} | ConvertTo-Json -Compress
        $blob = Invoke-RestMethod -Method Post -Headers $headers -ContentType "application/json" -Uri "$api/git/blobs" -Body $body
        $entries.Add(@{path=$repoPath;mode="100644";type="blob";sha=[string]$blob.sha})
    }
    foreach ($remote in @($remoteTree.tree)) {
        if ($remote.type -eq "blob" -and $remote.path.StartsWith("public/generated/",[StringComparison]::OrdinalIgnoreCase) -and -not $localPaths.Contains([string]$remote.path)) {
            $entries.Add(@{path=[string]$remote.path;mode="100644";type="blob";sha=$null})
        }
    }
    $treeBody = @{base_tree=$baseTreeSha;tree=$entries} | ConvertTo-Json -Depth 10 -Compress
    $newTree = Invoke-RestMethod -Method Post -Headers $headers -ContentType "application/json" -Uri "$api/git/trees" -Body $treeBody
    if ([string]$newTree.sha -eq $baseTreeSha) { return [pscustomobject]@{changed=$false;commit_sha=$parentSha} }
    $commitBody = @{message=$CommitMessage;tree=[string]$newTree.sha;parents=@($parentSha)} | ConvertTo-Json -Depth 10 -Compress
    $commit = Invoke-RestMethod -Method Post -Headers $headers -ContentType "application/json" -Uri "$api/git/commits" -Body $commitBody
    $refBody = @{sha=[string]$commit.sha;force=$false} | ConvertTo-Json -Compress
    Invoke-RestMethod -Method Patch -Headers $headers -ContentType "application/json" -Uri "$api/git/refs/heads/$GitHubBranch" -Body $refBody | Out-Null
    return [pscustomobject]@{changed=$true;commit_sha=[string]$commit.sha}
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
    $runBackup=Join-Path $BackupRoot "$([DateTime]::Now.ToString('yyyyMMdd-HHmmss'))-$($Project.project_id)"
    $moved=@(Backup-InputFiles $files $runBackup)
    $stateRemoved=Clear-WatcherState @($Project.project_id)
    $portfolio=Remove-OneProject $Project.project_id
    $published=Publish-GeneratedDataToGitHub "chore(data): fully clean project $($Project.project_id)"
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
    $runBackup = Join-Path $BackupRoot "$([DateTime]::Now.ToString('yyyyMMdd-HHmmss'))-$($Project.project_id)-$Period"
    $moved = @(Backup-InputFiles $files $runBackup)
    $stateRemoved = Clear-WatcherStateMonth $Project.project_id $Period
    $portfolio = Remove-OneMonth $Project.project_id $Period
    $published = Publish-GeneratedDataToGitHub "chore(data): remove $Period from $($Project.project_id)"
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
    $runBackup=Join-Path $BackupRoot "$([DateTime]::Now.ToString('yyyyMMdd-HHmmss'))-ALL"
    $moved=@(Backup-InputFiles $files $runBackup)
    $stateRemoved=Clear-WatcherState @() -All
    $portfolio=Remove-AllProjects
    $published=Publish-GeneratedDataToGitHub "chore(data): fully clean all generated projects"
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
