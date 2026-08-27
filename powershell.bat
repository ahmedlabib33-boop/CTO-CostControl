@echo off
setlocal
cd /d "%~dp0"

set "GITHUB_OWNER=ahmedlabib33-boop"
set "GITHUB_REPO=CTO-CostControl"
set "GITHUB_BRANCH=main"
set "UPLOAD_FOLDER=%~dp0public\generated"

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "$token=$env:GITHUB_TOKEN;" ^
  "$owner=$env:GITHUB_OWNER;" ^
  "$repo=$env:GITHUB_REPO;" ^
  "$branch=$env:GITHUB_BRANCH;" ^
  "$folder=$env:UPLOAD_FOLDER;" ^
  "if(!$token -or $token -eq 'PASTE_YOUR_TOKEN_HERE'){throw 'Set GITHUB_TOKEN before running this BAT file.'};" ^
  "if(!(Test-Path -LiteralPath $folder)){throw ('Folder not found: '+$folder)};" ^
  "$headers=@{" ^
  "  Authorization=('Bearer '+$token);" ^
  "  Accept='application/vnd.github+json';" ^
  "  'X-GitHub-Api-Version'='2022-11-28';" ^
  "  'User-Agent'='CTO-CostControl-Uploader'" ^
  "};" ^
  "$api='https://api.github.com/repos/'+$owner+'/'+$repo;" ^
  "Write-Host 'Reading GitHub branch...';" ^
  "$ref=Invoke-RestMethod -Headers $headers -Uri ($api+'/git/ref/heads/'+$branch);" ^
  "$parentSha=$ref.object.sha;" ^
  "$commit=Invoke-RestMethod -Headers $headers -Uri ($api+'/git/commits/'+$parentSha);" ^
  "$baseTreeSha=$commit.tree.sha;" ^
  "$remoteTree=Invoke-RestMethod -Headers $headers -Uri ($api+'/git/trees/'+$baseTreeSha+'?recursive=1');" ^
  "if($remoteTree.truncated){throw 'GitHub returned a truncated repository tree. Upload stopped safely.'};" ^
  "$entries=[System.Collections.Generic.List[object]]::new();" ^
  "$localPaths=[System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase);" ^
  "$files=Get-ChildItem -LiteralPath $folder -Recurse -File;" ^
  "if(!$files){throw 'No generated files were found.'};" ^
  "foreach($file in $files){" ^
  "  $relative=$file.FullName.Substring($folder.Length).TrimStart('\').Replace('\','/');" ^
  "  $repoPath='public/generated/'+$relative;" ^
  "  [void]$localPaths.Add($repoPath);" ^
  "  Write-Host ('Uploading '+$repoPath);" ^
  "  $bytes=[System.IO.File]::ReadAllBytes($file.FullName);" ^
  "  $content=[Convert]::ToBase64String($bytes);" ^
  "  $blobBody=@{content=$content;encoding='base64'}|ConvertTo-Json -Compress;" ^
  "  $blob=Invoke-RestMethod -Method Post -Headers $headers -ContentType 'application/json' -Uri ($api+'/git/blobs') -Body $blobBody;" ^
  "  $entries.Add(@{path=$repoPath;mode='100644';type='blob';sha=$blob.sha});" ^
  "};" ^
  "foreach($remote in $remoteTree.tree){" ^
  "  if($remote.type -eq 'blob' -and $remote.path.StartsWith('public/generated/') -and !$localPaths.Contains($remote.path)){" ^
  "    Write-Host ('Removing old remote file '+$remote.path);" ^
  "    $entries.Add(@{path=$remote.path;mode='100644';type='blob';sha=$null});" ^
  "  }" ^
  "};" ^
  "$treeBody=@{base_tree=$baseTreeSha;tree=$entries}|ConvertTo-Json -Depth 10 -Compress;" ^
  "$newTree=Invoke-RestMethod -Method Post -Headers $headers -ContentType 'application/json' -Uri ($api+'/git/trees') -Body $treeBody;" ^
  "if($newTree.sha -eq $baseTreeSha){Write-Host 'No generated-data changes found. Nothing uploaded.';exit 0};" ^
  "$message='chore(data): publish validated cost-control update';" ^
  "$commitBody=@{message=$message;tree=$newTree.sha;parents=@($parentSha)}|ConvertTo-Json -Depth 10 -Compress;" ^
  "$newCommit=Invoke-RestMethod -Method Post -Headers $headers -ContentType 'application/json' -Uri ($api+'/git/commits') -Body $commitBody;" ^
  "$refBody=@{sha=$newCommit.sha;force=$false}|ConvertTo-Json -Compress;" ^
  "Invoke-RestMethod -Method Patch -Headers $headers -ContentType 'application/json' -Uri ($api+'/git/refs/heads/'+$branch) -Body $refBody|Out-Null;" ^
  "Write-Host ('SUCCESS: GitHub commit '+$newCommit.sha);" ^
  "Write-Host 'Vercel deployment should start automatically.'"

if errorlevel 1 (
    echo.
    echo UPLOAD FAILED.
    pause
    exit /b 1
)

echo.
echo UPLOAD COMPLETED.
pause
