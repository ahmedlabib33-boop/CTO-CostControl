[CmdletBinding()]
param(
    [string]$Root = "",
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
if ([string]::IsNullOrWhiteSpace($Root)) {
    $Root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
}
$Root = [IO.Path]::GetFullPath($Root)
$script:localUrl = "http://localhost:3000"
$script:publicUrl = "https://cto-cost-control.vercel.app"

if (-not (Test-Path -LiteralPath (Join-Path $Root "node_modules") -PathType Container)) {
    throw "node_modules was not found. Run INSTALL_AND_VERIFY.bat first."
}

$script:server = $null
$script:cancelRequested = $false
$script:cancelHandler = [ConsoleCancelEventHandler]{
    param($sender, $eventArgs)
    $eventArgs.Cancel = $true
    $script:cancelRequested = $true
}

function Stop-DevServer {
    $pids = @()
    if ($null -ne $script:server) { $pids += $script:server.Id }
    try {
        $pids += @(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction Stop | Select-Object -ExpandProperty OwningProcess)
    }
    catch { }
    $pids = @($pids | Where-Object { $_ -and [int]$_ -gt 0 } | Sort-Object -Unique)
    try {
        foreach ($pid in $pids) {
            & taskkill.exe /PID $pid /T /F *> $null
        }
        if ($script:server -and -not $script:server.HasExited) { $script:server.WaitForExit(5000) }
    }
    finally {
        $script:server = $null
    }
}

function Test-LocalServerAlive {
    try {
        return [bool](Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction Stop | Select-Object -First 1)
    }
    catch {
        return $false
    }
}

function Start-DevServer {
    Stop-DevServer
    $script:server = Start-Process `
        -FilePath "cmd.exe" `
        -ArgumentList @("/d", "/c", "npm run dev") `
        -WorkingDirectory $Root `
        -PassThru `
        -WindowStyle Normal
    Write-Host "Local server started in its own window (PID $($script:server.Id))." -ForegroundColor Green
    Write-Host "Local URL: $script:localUrl" -ForegroundColor Cyan
    $networkAddress = $null
    try {
        $networkAddress = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
            Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
            Select-Object -ExpandProperty IPAddress -First 1
    }
    catch { }
    if ($networkAddress) {
        Write-Host "Same-network URL: http://$networkAddress`:3000 (works only when the device/firewall allows it)." -ForegroundColor Cyan
    }
    Write-Host "Public Vercel URL: $script:publicUrl" -ForegroundColor Cyan
    if (-not $NoBrowser) {
        Start-Process "$script:localUrl/?refresh=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
    }
}

function Clear-DevCache {
    $cachePath = Join-Path $Root ".next\cache"
    if (Test-Path -LiteralPath $cachePath -PathType Container) {
        Remove-Item -LiteralPath $cachePath -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "Transient Next cache cleared." -ForegroundColor DarkGray
    }
}

function Test-LocalConnection {
    $healthUrl = "$script:localUrl/api/health?refresh=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
    for ($attempt = 1; $attempt -le 15; $attempt++) {
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri $healthUrl -TimeoutSec 3
            if ([int]$response.StatusCode -eq 200) {
                Write-Host "Connection refreshed: local health endpoint returned HTTP 200." -ForegroundColor Green
                if (-not $NoBrowser) {
                    Start-Process "$script:localUrl/?refresh=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
                }
                return $true
            }
        }
        catch { }
        Start-Sleep -Seconds 1
    }
    Write-Host "The server is still starting or the health check failed; the server window remains open." -ForegroundColor Yellow
    return $false
}

[Console]::add_CancelKeyPress($script:cancelHandler)
try {
    Start-DevServer
    while ($true) {
        Start-Sleep -Milliseconds 250
        $serverStopped = -not (Test-LocalServerAlive)
        if (-not $script:cancelRequested -and -not $serverStopped) { continue }

        if ($serverStopped -and -not $script:cancelRequested) {
            Write-Host "The local server stopped unexpectedly." -ForegroundColor Yellow
        }
        $script:cancelRequested = $false

        while ($true) {
            $choice = (Read-Host "Choose Y = exit, N = keep/restart, R = refresh connection and restart").Trim().ToUpperInvariant()
            if ($choice -eq "Y") {
                Stop-DevServer
                Write-Host "Local app stopped." -ForegroundColor Cyan
                exit 0
            }
            if ($choice -eq "N") {
                if ($null -eq $script:server -or $script:server.HasExited) {
                    Start-DevServer
                }
                else {
                    Write-Host "Continuing without a refresh." -ForegroundColor Cyan
                }
                break
            }
            if ($choice -eq "R") {
                Stop-DevServer
                Clear-DevCache
                Start-DevServer
                [void](Test-LocalConnection)
                break
            }
            Write-Host "Please enter Y, N, or R." -ForegroundColor Yellow
        }
    }
}
finally {
    [Console]::remove_CancelKeyPress($script:cancelHandler)
    Stop-DevServer
}
