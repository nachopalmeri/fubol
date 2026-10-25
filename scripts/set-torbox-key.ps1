# Guarda la API key de TorBox sin mostrarla en pantalla ni en logs.
# Uso: powershell -ExecutionPolicy Bypass -File scripts\set-torbox-key.ps1

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

$secrets = Join-Path $repo '.secrets'
$keyFile = Join-Path $secrets 'torbox.key'
New-Item -ItemType Directory -Path $secrets -Force | Out-Null

$secure = Read-Host 'Pegá la API key de TorBox (no se muestra)' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

if ([string]::IsNullOrWhiteSpace($plain)) {
  throw 'La key está vacía; no se guardó nada.'
}

# Sin comillas, sin espacios al final, sin BOM.
$plain = $plain.Trim()
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText($keyFile, $plain, $utf8NoBom)
$plain = $null
[GC]::Collect()

Write-Host 'key_guardada=true'
Write-Host "archivo=$keyFile"

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { $node = 'D:\Programas\nodejs\node.exe' }
if (-not (Test-Path $node)) {
  Write-Host 'node_no_encontrado=true'
  Write-Host 'La key quedó guardada; ejecutá la validación cuando Node esté disponible.'
  exit 0
}

Write-Host 'validando...'
& $node 'scripts/torbox-validate.mjs'
if ($LASTEXITCODE -ne 0) {
  Write-Host 'validacion=fallida'
  exit $LASTEXITCODE
}

Write-Host 'aplicando configuración...'
& $node 'scripts/aiostreams-config.mjs' prepare --require-key
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host 'actualizando perfil familiar...'
& $node 'scripts/family-profile.mjs'
exit $LASTEXITCODE
