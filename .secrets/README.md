# Secretos locales

Esta carpeta está ignorada por git. **Nunca** subas su contenido, lo pegues en un chat,
lo imprimas en logs ni lo incluyas en capturas.

## TorBox

1. Creá el archivo `torbox.key` en esta carpeta.
2. Pegá **solo** la API key, en una línea, sin comillas, sin espacios al final y sin BOM.
3. Guardá el archivo. No hace falta reiniciar nada.

Ejemplo de formato (con un valor ficticio, no real):

```text
00000000-0000-0000-0000-000000000000
```

## Reglas

- El archivo se lee desde scripts locales; el valor no se imprime.
- Si la key se filtró, revocala en TorBox y reemplazá el archivo.
- Para borrarla: eliminá `torbox.key` y revocá la key en el panel de TorBox.
- No uses esta carpeta para cookies, tokens de sesión ni contraseñas de AIOStreams:
  esos viven en `.env` o en la base de AIOStreams.

## Verificación sin exponer el valor

```powershell
Test-Path .secrets\torbox.key
(Get-Item .secrets\torbox.key).Length
```

El largo es metadata; no confirma que la key sea válida. La validación real se hace
contra la API de TorBox sin mostrar la clave.
