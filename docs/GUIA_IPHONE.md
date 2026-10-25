# Fubol en iPhone

## Lo que ya quedó preparado en la PC

- Perfil de certificado local: `D:\Fubol\iPhone\Fubol-LAN-CA.mobileconfig`.
- Perfil familiar separado del usuario dueño: `.secrets/family-user.env`.
- URL del servidor en la LAN: `https://192.168.0.122` (solo funciona en la misma red).
- Página privada de alta familiar: `https://192.168.0.122/family-setup/` (solo IPs privadas).

El instalador del certificado ya está publicado en la LAN, sin credenciales:
`http://192.168.0.122/family-setup/Fubol-LAN-CA.mobileconfig`.

## Preparar confianza HTTPS (una vez en el iPhone)

1. Conectar el iPhone al Wi-Fi de casa y abrir el enlace de instalación en Safari.
2. Ir a **Ajustes → Perfil descargado** y tocar **Instalar**.
3. Ir a **Ajustes → General → Información → Ajustes de confianza de certificados**.
4. Activar confianza completa para **Caddy Local Authority - 2026 ECC Root**.
5. Conectar el iPhone al mismo Wi-Fi de la casa que la PC.
6. Abrir `https://192.168.0.122/family-setup/`, tocar **Copiar acceso de Fubol** y seguir los
   pasos de la página para instalar el manifest en Stremio Web.

## Acceso y reproducción

- Usar **Stremio Web desde Safari** y agregarlo a Inicio. En Ajustes, seleccionar **VLC** u
  **Outplayer** como reproductor externo; ambos se instalan desde App Store.
- El manifest familiar se copia desde la página de alta segura; no usar el manifest del dueño.
- Según la guía oficial de Stremio, Stremio Web en iOS depende de reproductor externo y no admite
  todos los streams; hay que validar HLS y VOD en el iPhone real.
- La web oficial de Nuvio indica actualmente “TestFlight unavailable”; no contar con instalar su
  cliente iOS hasta que vuelva a estar disponible.
- Guía oficial de Stremio para iPhone/iPad: <https://blog.stremio.com/using-stremio-web-on-iphone-ipad/>.
- La reproducción completa en iPhone queda **pendiente de prueba en el teléfono real**; no se
  declara PASS por tener solo el servidor configurado.

## Troubleshooting

- Si Safari muestra un error de certificado, revisar el paso de confianza completa.
- Si no abre, comprobar que el iPhone esté en el Wi-Fi de casa y que Docker Desktop siga activo.
- Si navega pero no reproduce un MKV, es una limitación del reproductor iOS, no del catálogo.
