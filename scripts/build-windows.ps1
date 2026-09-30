param([switch]$Installer, [Parameter(ValueFromRemainingArguments=$true)][string[]]$Options)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$silentMode = ($env:SILENT -eq '1') -or (@($Options | Where-Object { $_ -in @('/s', '--silent') }).Count -gt 0)
$runAfter = ($env:RUN_AFTER_BUILD -eq '1') -or (@($Options | Where-Object { $_ -in @('/run', '--run') }).Count -gt 0)
$clock = [Diagnostics.Stopwatch]::StartNew()
Push-Location $root
try {
  & (Join-Path $PSScriptRoot 'bootstrap.ps1')
  $manifest = Get-Content -LiteralPath 'build-manifest.json' -Raw | ConvertFrom-Json
  $command = if ($Installer) { $manifest.installerCommand } else { $manifest.packageCommand }
  & npm.cmd run $command
  if ($LASTEXITCODE -ne 0) { throw "Build failed with exit code $LASTEXITCODE" }
  foreach ($relative in @($manifest.executable, $manifest.resources)) {
    $target = Join-Path $root $relative
    if (-not (Test-Path -LiteralPath $target) -or (Get-Item -LiteralPath $target).Length -eq 0) { throw "Missing build output: $relative" }
    Write-Host "$relative SHA256 $((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash)"
  }
  if ($Installer) {
    $installerRoot = Join-Path $root $manifest.installerDirectory
    foreach ($pattern in @('*Setup.exe', 'RELEASES', '*-full.nupkg')) {
      $files = @(Get-ChildItem -LiteralPath $installerRoot -Filter $pattern)
      if ($files.Count -eq 0) { throw "Missing Squirrel output: $pattern" }
      foreach ($file in $files) { Write-Host "$($file.Name) $($file.Length) bytes SHA256 $((Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash)" }
    }
    Write-Host 'Squirrel.Windows installer is unsigned. Windows may show an unknown-publisher warning.'
  }
  Write-Host ('Build completed in {0:n1} seconds.' -f $clock.Elapsed.TotalSeconds)
  if (-not $silentMode -and -not $runAfter -and -not $Installer) { $runAfter = (Read-Host 'Launch Harness now? [y/N]') -eq 'y' }
  if ($runAfter) { Start-Process -FilePath (Join-Path $root $manifest.executable) -WindowStyle Hidden }
} catch { Write-Error $_; exit 1 } finally { Pop-Location }
