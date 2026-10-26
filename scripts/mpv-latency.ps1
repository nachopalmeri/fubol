#Requires -Version 5.1
<#
.SYNOPSIS
  Instala el perfil de mpv estable o de latencia baja en los clientes Fubol.

.DESCRIPTION
  Copia config/mpv/mpv.conf (stable, 18 s de cache) o
  config/mpv/mpv.low.conf (low, 8 s) a cada cliente, con backup del archivo
  anterior. No toca secretos ni configuracion de red.

.EXAMPLE
  powershell -File scripts/mpv-latency.ps1 -Mode low
  powershell -File scripts/mpv-latency.ps1 -Mode stable
#>
param(
  [ValidateSet('stable', 'low')]
  [string]$Mode = 'stable',
  [string[]]$Clients = @(
    'D:\Fubol\Client\data\mpv\mpv.conf',
    'D:\Fubol\MamaClient\data\mpv\mpv.conf'
  )
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$sourceName = if ($Mode -eq 'low') { 'mpv.low.conf' } else { 'mpv.conf' }
$source = Join-Path $root (Join-Path 'config\mpv' $sourceName)
if (-not (Test-Path -LiteralPath $source)) {
  throw "No existe el perfil: $source"
}

function Get-Sha256([string]$FilePath) {
  $stream = [System.IO.File]::OpenRead($FilePath)
  try {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
      $bytes = $sha.ComputeHash($stream)
      return ([System.BitConverter]::ToString($bytes) -replace '-', '').ToLowerInvariant()
    } finally { $sha.Dispose() }
  } finally { $stream.Dispose() }
}

$sourceHash = Get-Sha256 $source
Write-Output "mode=$Mode"
Write-Output "source=$source"
Write-Output "source_sha256=$sourceHash"

$installed = 0
foreach ($client in $Clients) {
  $dir = Split-Path -Parent $client
  if (-not (Test-Path -LiteralPath $dir)) {
    Write-Warning "Cliente no encontrado, se omite: $client"
    continue
  }
  if (Test-Path -LiteralPath $client) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $backup = "$client.bak.$stamp"
    Copy-Item -LiteralPath $client -Destination $backup -Force
    Write-Output "backup=$backup"
  }
  Copy-Item -LiteralPath $source -Destination $client -Force
  $hash = Get-Sha256 $client
  $state = if ($hash -eq $sourceHash) { 'ok' } else { 'mismatch' }
  Write-Output "installed=$client sha256=$hash state=$state"
  $installed++
}

Write-Output "clients_updated=$installed"
