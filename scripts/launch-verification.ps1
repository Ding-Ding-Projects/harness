param(
  [Parameter(Mandatory=$true)][string]$LowlevelPath,
  [int]$Port = 43189,
  [string]$ProfilePath
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content -LiteralPath (Join-Path $root 'build-manifest.json') -Raw | ConvertFrom-Json
$exe = [IO.Path]::GetFullPath((Join-Path $root $manifest.executable))
$archive = [IO.Path]::GetFullPath((Join-Path $root $manifest.resources))
if (-not (Test-Path -LiteralPath $exe)) { throw 'Build the packaged application before verification.' }
if (-not (Test-Path -LiteralPath $LowlevelPath)) { throw 'The supplied cheap Lowlevel executable does not exist.' }
if ($Port -lt 1024 -or $Port -gt 65535) { throw 'Invalid verification port.' }
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { throw 'Verification port is already in use.' }
$runRoot = Join-Path $root ('.local/ui-' + [Guid]::NewGuid().ToString('N'))
$outputRoot = Join-Path $runRoot 'output'
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
$desktop = 'HarnessVerification-' + [Guid]::NewGuid().ToString('N')
$data = Join-Path $runRoot 'profile'
if ($ProfilePath) {
  $data = [IO.Path]::GetFullPath($ProfilePath)
  $ownedRoot = [IO.Path]::GetFullPath((Join-Path $root '.local')) + [IO.Path]::DirectorySeparatorChar
  if (-not $data.StartsWith($ownedRoot, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $data -PathType Container)) { throw 'A reused verification profile must exist under the owned .local directory.' }
}
$previousData = $env:HARNESS_DATA_DIR
try {
  $env:HARNESS_DATA_DIR = $data
  $command = '"{0}" --remote-debugging-address=127.0.0.1 --remote-debugging-port={1} --disable-gpu' -f $exe,$Port
  $inputJson = @{ name = $desktop; command = $command } | ConvertTo-Json -Compress
  $nativeJson = if ($PSVersionTable.PSVersion.Major -lt 7) { $inputJson.Replace('"', '\"') } else { $inputJson }
  $launch = (& $LowlevelPath launch_on_headless_desktop --json $nativeJson | Out-String | ConvertFrom-Json)
  if (-not $launch.ok -or -not $launch.pid) { throw 'Cheap Lowlevel launch did not succeed.' }
} finally { $env:HARNESS_DATA_DIR = $previousData }
$launchedPid = [int]$launch.pid
$processInfo = Get-CimInstance Win32_Process -Filter ("ProcessId = " + $launchedPid)
if (-not $processInfo -or $processInfo.ExecutablePath -ne $exe) { throw 'Launched process identity did not match the selected executable.' }
$creationDate = & powershell.exe -NoProfile -NonInteractive -Command ('[string](Get-CimInstance Win32_Process -Filter "ProcessId = {0}").CreationDate' -f $launchedPid)
$expectedUrl = ([uri]($archive.Replace('\','/') + '/dist/renderer/index.html')).AbsoluteUri
$state = @{
  version = 1; desktop = $desktop; pid = $launchedPid; created = $true; cleaned = $false
  process = @{ pid = $launchedPid; parentPid = [int]$processInfo.ParentProcessId; creationDate = [string]$creationDate; executablePath = [string]$processInfo.ExecutablePath }
  runRoot = $runRoot; outputRoot = $outputRoot; lowlevelPath = $LowlevelPath
  cdp = @{ port = $Port; expectedUrl = $expectedUrl }
  executableSha256 = (Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash
  archiveSha256 = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash
}
$statePath = Join-Path $runRoot 'launch.json'
$state | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $statePath -Encoding UTF8
$deadline = [DateTime]::UtcNow.AddSeconds(30)
do {
  $query = @{ name = $desktop } | ConvertTo-Json -Compress
  $nativeQuery = if ($PSVersionTable.PSVersion.Major -lt 7) { $query.Replace('"', '\"') } else { $query }
  $windows = (& $LowlevelPath list_headless_windows --json $nativeQuery | Out-String | ConvertFrom-Json)
  $matches = @($windows.windows | Where-Object { $_.process_id -eq $launchedPid -and $_.class -eq 'Chrome_WidgetWin_1' -and $_.width -gt 0 -and $_.height -gt 0 })
  if ($matches.Count -eq 1) { break }
  Start-Sleep -Milliseconds 300
} while ([DateTime]::UtcNow -lt $deadline)
if ($matches.Count -ne 1) { throw "No unique application window found. Launch state: $statePath" }
$state.hwnd = [long]$matches[0].handle
[IO.File]::WriteAllText($statePath, ($state | ConvertTo-Json -Depth 6))
Write-Output ($state | ConvertTo-Json -Depth 6)
Write-Output ("Launch receipt: " + $statePath)
