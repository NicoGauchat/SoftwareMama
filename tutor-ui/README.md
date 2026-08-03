# SoftwareMama Web

Aplicación React desplegable como un único proyecto full-stack de Cloudflare
Workers, con Turso como base de datos remota.

## Comandos

```powershell
npm run dev          # Vite con recarga rápida; requiere Worker local en :8787
npm run dev:worker   # API y archivos compilados en Wrangler
npm run lint
npm run build
npm run check:worker
npm run deploy
```

## Demo local para presentaciones

```powershell
npm run demo
```

Abre la interfaz con datos completamente ficticios guardados solamente en el
navegador: alumnos, clases, cobros, escuelas, exámenes y maestras. No usa los
secretos de Turso y no puede modificar la base de producción. El resumen
mensual comienza en el mes anterior para mostrar un período completo.

Ver [DEPLOY.md](DEPLOY.md) para la configuración inicial y los secretos.
