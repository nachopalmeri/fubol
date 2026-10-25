# cleanup-test-cas.ps1
# Elimina del almacen de certificados del usuario (Root) las 3 CAs de prueba que
# Caddy creo durante las pruebas de Etapa A en esta maquina.
# Son inertes (sus claves privadas ya fueron eliminadas); esto solo limpia el almacen.
# Windows puede pedir confirmacion interactiva por cada certificado.
# Referencia: audit/09_STAGE_A_IMPLEMENTATION.md, seccion 9.
#
# Uso:  powershell -ExecutionPolicy Bypass -File scripts\cleanup-test-cas.ps1

$ErrorActionPreference = 'Continue'

$thumbprints = @(
  'c38ffddc8f2097257d1982958d2e5f8f7ac44cf7',
  '83dce5e390bc7a64600338a91ca951a8c8d6549f',
  '19ed672ba1d8b055fa42b0801cf2bd24c72089fb'
)

foreach ($tp in $thumbprints) {
  Write-Host ''
  Write-Host "Eliminando CA de prueba $tp ..."
  certutil -user -delstore Root $tp
}

Write-Host ''
$remaining = certutil -user -store Root | Select-String -Pattern 'Caddy Local Authority'
if ($remaining) {
  Write-Host 'Todavia quedan certificados "Caddy Local Authority" en el almacen del usuario:'
  $remaining | ForEach-Object { Write-Host ('  ' + $_.Line) }
  Write-Host 'Si cancelaste alguna confirmacion, volve a correr el script (o usa certmgr.msc).'
} else {
  Write-Host 'OK: no quedan CAs "Caddy Local Authority" en el almacen del usuario.'
}
