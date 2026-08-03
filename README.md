# Mis clases

Aplicación web full-stack creada para simplificar la gestión diaria de una
profesora particular. El proyecto nació de una necesidad real: reemplazar
anotaciones y procesos manuales por una herramienta sencilla, privada y
accesible desde cualquier dispositivo.

## Funcionalidades

- Agenda diaria y semanal de clases.
- Administración de alumnos y familiares responsables.
- Registro de asistencias, ausencias y reprogramaciones.
- Control de pagos totales, parciales y mixtos.
- Seguimiento de saldos pendientes por alumno.
- Gestión de escuelas, grados, evaluaciones y contactos docentes.
- Resúmenes mensuales y estadísticas de facturación y cobranza.
- Exportación de reportes globales e individuales a Excel.
- Acceso privado con persistencia de sesión.

## Tecnologías

- **Frontend:** React, Vite y Tailwind CSS.
- **Backend y hosting:** Cloudflare Workers con Hono.
- **Base de datos:** Turso, compatible con SQLite.
- **Reportes:** generación de archivos Excel desde el navegador.

La aplicación de producción vive íntegramente en [`tutor-ui`](tutor-ui). El
servidor Go y las bases `.db` de la raíz se conservan únicamente como referencia
de la primera versión local y no forman parte del despliegue de Cloudflare.

## Demo local

La demo incluye información completamente ficticia y nunca se conecta con la
base de producción.

```powershell
cd tutor-ui
npm install
npm run demo
```

Para conocer la configuración del Worker, los secretos y el proceso de
publicación, consultá [tutor-ui/DEPLOY.md](tutor-ui/DEPLOY.md).
