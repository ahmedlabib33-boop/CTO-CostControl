[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Root,

    [switch]$SelfTest
)

$ErrorActionPreference = 'Stop'

function Get-PasswordHash {
    param([System.Security.SecureString]$SecurePassword)

    $bstr = [IntPtr]::Zero
    try {
        $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecurePassword)
        $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
        if ([string]::IsNullOrWhiteSpace($plain)) {
            throw 'Password cannot be empty.'
        }

        $bytes = [Text.Encoding]::UTF8.GetBytes($plain)
        $digest = [Security.Cryptography.SHA256]::Create().ComputeHash($bytes)
        return [BitConverter]::ToString($digest).Replace('-', '').ToLowerInvariant()
    }
    finally {
        if ($bstr -ne [IntPtr]::Zero) {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
        }
        $plain = $null
    }
}

if ($SelfTest) {
    $sample = ConvertTo-SecureString 'password-gate-self-test' -AsPlainText -Force
    $hash = Get-PasswordHash -SecurePassword $sample
    if ($hash -ne '5031e49fe1a82200611097c736fc19ba9248e66f929b0549f2cdcd3a415162d6') {
        throw 'Password gate self-test failed.'
    }
    Write-Host 'PASSWORD-GATE SELF-TEST PASS'
    exit 0
}

$rootPath = [IO.Path]::GetFullPath($Root)
$runtimePath = Join-Path $rootPath '.runtime'
$hashPath = Join-Path $runtimePath 'manual-bat-password.sha256'

[IO.Directory]::CreateDirectory($runtimePath) | Out-Null

if (-not (Test-Path -LiteralPath $hashPath -PathType Leaf)) {
    Write-Host ''
    Write-Host 'First use: create the password for the three manual BAT files.' -ForegroundColor Yellow
    $first = Read-Host 'Create password' -AsSecureString
    $second = Read-Host 'Repeat password' -AsSecureString
    $firstHash = Get-PasswordHash -SecurePassword $first
    $secondHash = Get-PasswordHash -SecurePassword $second

    if ($firstHash -cne $secondHash) {
        throw 'Passwords did not match. Nothing was saved.'
    }

    $temporaryHashPath = "$hashPath.$([Guid]::NewGuid().ToString('N')).tmp"
    try {
        [IO.File]::WriteAllText($temporaryHashPath, "$firstHash`r`n", [Text.UTF8Encoding]::new($false))
        Move-Item -LiteralPath $temporaryHashPath -Destination $hashPath -Force
    }
    finally {
        if (Test-Path -LiteralPath $temporaryHashPath) {
            Remove-Item -LiteralPath $temporaryHashPath -Force -ErrorAction SilentlyContinue
        }
    }

    Write-Host 'Password created. This BAT is now locked behind the password.' -ForegroundColor Green
    exit 0
}

$expectedHash = (Get-Content -LiteralPath $hashPath -Raw -ErrorAction Stop).Trim().ToLowerInvariant()
if ($expectedHash -notmatch '^[0-9a-f]{64}$') {
    throw "The password hash file is invalid: $hashPath"
}

$attempt = Read-Host 'Enter manual BAT password' -AsSecureString
$actualHash = Get-PasswordHash -SecurePassword $attempt
$expectedBytes = [Text.Encoding]::ASCII.GetBytes($expectedHash)
$actualBytes = [Text.Encoding]::ASCII.GetBytes($actualHash)
$difference = 0
for ($i = 0; $i -lt $expectedBytes.Length; $i++) {
    $difference = $difference -bor ($expectedBytes[$i] -bxor $actualBytes[$i])
}

if ($difference -ne 0) {
    throw 'Access denied. The manual BAT password is incorrect.'
}

Write-Host 'Password accepted.' -ForegroundColor Green
exit 0
