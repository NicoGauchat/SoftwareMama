# SoftwareMama API

Backend Go para la gestión de clases particulares, organizado como Clean Architecture:

```
cmd/api                  Composición de dependencias y servidor
internal/domain          Entidades y reglas independientes
internal/repository      Contratos y adaptador SQLite/Turso
internal/usecase         Casos de uso
internal/delivery/http   DTOs, handlers y rutas Gin
pkg                      Utilidades reutilizables (reservado)
```

## Iniciar la aplicación

Abrí una terminal en la carpeta principal del proyecto e iniciá el backend:

```powershell
go run ./cmd/api
```

Después abrí una segunda terminal e iniciá el frontend:

```powershell
cd tutor-ui
npm install
npm run dev
```

El backend queda disponible en `http://localhost:8080` y el frontend en
`http://localhost:5173`. `npm install` sólo es necesario la primera vez o cuando
cambian las dependencias.

Opcionalmente se puede indicar otra base de datos antes de iniciar el backend:

```powershell
$env:DATABASE_URL = "file:softwaremama.db"
go run ./cmd/api
```

El backend usa un controlador SQLite escrito completamente en Go, por lo que no
necesita instalar un compilador de C en Windows.

## Endpoints

| Método | Ruta | Función |
| --- | --- | --- |
| GET | `/health` | Estado del servicio |
| GET | `/api/v1/lessons?date=2026-07-29` | Turnos de un día |
| PATCH | `/api/v1/lessons/:id/complete` | Completar turno y calcular importe |
| PATCH | `/api/v1/lessons/:id/reschedule` | Mover sólo el turno real |
| PATCH | `/api/v1/lessons/:id/cancel` | Cancelar turno |
| GET | `/api/v1/schools` | Escuelas con sus grados, materias y evaluaciones |
| POST | `/api/v1/students/:id/assessments` | Agregar una evaluación al seguimiento individual |

Ejemplo para completar:

```json
{
  "realDurationMinutes": 60,
  "attendance": "present",
  "paymentStatus": "paid",
  "topicNotes": "Fracciones y proporciones"
}
```
