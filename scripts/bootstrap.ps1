$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'file-hash.ps1')
$manifest = Get-Content -LiteralPath (Join-Path $root 'build-manifest.json') -Raw | ConvertFrom-Json
$version = $manifest.nodeVersion
if (-not [Environment]::Is64BitOperatingSystem) { throw 'Harness requires 64-bit Windows.' }
$tools = Join-Path $root '.tools'
$nodeRoot = Join-Path $tools "node-v$version-win-x64"
$nodeExe = Join-Path $nodeRoot 'node.exe'
$currentNode = Get-Command node.exe -ErrorAction SilentlyContinue
$useInstalled = $false
if ($currentNode) { $useInstalled = ((& $currentNode.Source --version) -eq "v$version") -and ((& $currentNode.Source -p 'process.arch') -eq 'x64') }
if (-not $useInstalled) {
  if (-not (Test-Path -LiteralPath $nodeExe)) {
    New-Item -ItemType Directory -Path $tools -Force | Out-Null
    $filename = "node-v$version-win-x64.zip"
    $base = "https://nodejs.org/dist/v$version"
    $staging = Join-Path $tools ('staging-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $staging | Out-Null
    Write-Host "Downloading pinned Node.js $version from $base"
    $checksums = (Invoke-WebRequest -UseBasicParsing -Uri "$base/SHASUMS256.txt").Content
    $line = $checksums -split "`n" | Where-Object { $_.Trim().EndsWith("  $filename") }
    if (@($line).Count -ne 1) { throw 'Pinned Node.js checksum is missing or ambiguous.' }
    $expected = ($line.Trim() -split '\s+')[0]
    $zip = Join-Path $staging $filename
    Invoke-WebRequest -UseBasicParsing -Uri "$base/$filename" -OutFile $zip
    if ((Get-TaskFileHash $zip) -ne $expected.ToLowerInvariant()) { throw 'Pinned Node.js archive checksum mismatch.' }
    Expand-Archive -LiteralPath $zip -DestinationPath $staging
    $extracted = Join-Path $staging "node-v$version-win-x64"
    if ((& (Join-Path $extracted 'node.exe') --version) -ne "v$version") { throw 'Downloaded Node.js version mismatch.' }
    Move-Item -LiteralPath $extracted -Destination $nodeRoot
  }
  if ((& $nodeExe --version) -ne "v$version" -or (& $nodeExe -p 'process.arch') -ne 'x64') { throw 'Cached Node.js version or architecture mismatch.' }
  $env:PATH = "$nodeRoot;$env:PATH"
}
Push-Location $root
try {
  Write-Host 'Installing locked project dependencies.'
  & npm.cmd ci --no-fund
  if ($LASTEXITCODE -ne 0) { throw "npm ci failed with exit code $LASTEXITCODE" }
  # Recent Electron packages require explicit runtime installation.
  & node.exe (Join-Path $root 'node_modules/electron/install.js')
  if ($LASTEXITCODE -ne 0) { throw "Desktop runtime installation failed with exit code $LASTEXITCODE" }
} finally { Pop-Location }
Write-Host 'Dependencies ready.'
