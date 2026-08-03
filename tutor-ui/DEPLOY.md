# Deploy en Cloudflare Workers con Turso

La web, la API y los archivos estáticos se publican juntos en un solo Worker.
La base de Turso empieza vacía y las tablas se crean automáticamente la primera
vez que la aplicación hace una consulta autenticada.

## 1. Datos que necesitás de Turso

Desde la base `software Mama`, copiá:

- La URL de la base, con formato `libsql://...turso.io`.
- Un token de acceso a la base.

No pegues esos valores en ningún archivo que vayas a compartir.

## 2. Entrar a Cloudflare

Abrí PowerShell en esta carpeta y ejecutá:

```powershell
npm install
npx wrangler login
```

El navegador va a pedirte autorizar a Wrangler en tu cuenta de Cloudflare.

## 3. Crear el Worker

```powershell
npm run deploy
```

Al terminar, Wrangler muestra una dirección parecida a
`https://software-mama.tu-cuenta.workers.dev`. En este primer despliegue la web
ya existe, pero todavía falta cargar los secretos.

## 4. Cargar los cuatro secretos

Ejecutá cada comando y pegá el valor cuando Wrangler lo pida. Lo que escribís no
se muestra en pantalla.

```powershell
npx wrangler secret put TURSO_DATABASE_URL
npx wrangler secret put TURSO_AUTH_TOKEN
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SESSION_SECRET
```

- `ADMIN_PASSWORD`: la contraseña que va a usar la única persona que entra a la web.
- `SESSION_SECRET`: una cadena aleatoria distinta de la contraseña, de 32 caracteres
  o más. Se puede generar en PowerShell así:

```powershell
[byte[]]$randomBytes = 1..48 | ForEach-Object { Get-Random -Maximum 256 }
[Convert]::ToBase64String($randomBytes)
```

Cada `secret put` guarda el dato cifrado y publica una nueva versión del Worker.
Después del cuarto comando no hace falta volver a desplegar.

## 5. Probar

Abrí la URL de `workers.dev`, ingresá con `ADMIN_PASSWORD` y cargá el primer
alumno. Ese primer acceso crea automáticamente todas las tablas en la base vacía
de Turso.

Para comprobar que el Worker responde, también podés abrir `/health` al final de
la URL. Tiene que mostrar `{"status":"ok"}`.

## Actualizaciones futuras

Cada vez que cambie el código:

```powershell
npm run deploy
```

Los secretos permanecen guardados y los datos de Turso no se borran.

## Desarrollo local opcional

Copiá `.dev.vars.example` como `.dev.vars`, completá sus cuatro valores y luego:

```powershell
npm run build
npm run dev:worker
```

Wrangler sirve la aplicación en `http://localhost:8787`. `.dev.vars` está
excluido del control de versiones para evitar publicar credenciales.
