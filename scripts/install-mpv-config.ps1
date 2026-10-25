# Installs the low-latency live HLS config into the portable AIOStreams
# clients. Backs up the current mpv.conf before replacing it.
#
# Usage: powershell -ExecutionPolicy Bypass -File scripts\install-mpv-config.ps1

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$source = Join-Path $repo 'config\mpv\mpv.conf'
$targets = @(
  'D:\Fubol\Client\data\mpv\mpv.conf',
  'D:\Fubol\MamaClient\data\mpv\mpv.conf'
)

if (-not (Test-Path $source)) {
  throw "missing config: $source"
}

foreach ($target in $targets) {
  $dir = Split-Path -Parent $target
  if (-not (Test-Path $dir)) {
    Write-Host "skip=$target (client not installed)"
    continue
  }
  if (Test-Path $target) {
    $backup = "$target.bak.$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    Copy-Item $target $backup
    Write-Host "backup=$backup"
  }
  Copy-Item $source $target -Force
  Write-Host "installed=$target"
}
