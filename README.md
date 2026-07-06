# SISTEMA_DE_INFORMACION_I/2026

Proyecto por capas:

- **backend:** Django + DRF + PostgreSQL
- **frontend:** React (Vite) + TailwindCSS

## Requisitos

Elegí **una** forma de correr el proyecto:

| Modo | Necesitás |
|------|-----------|
| **Docker (recomendado)** | [Docker Desktop](https://www.docker.com/products/docker-desktop/) en ejecución |
| **Manual (Windows)** | PostgreSQL 15+ (puerto `5432`), Python 3.11+, Node.js 20+ |

Credenciales por defecto de la base: usuario `postgres`, contraseña `diego`, base `cosmetica_sistema`.

Usuarios seed (contraseña **`123456`**): `smartinez`, `dalvarez`, `vtorres`, `rparedes`, `alucero`.

---

## Opción A — Docker (recomendado)

Desde la **raíz** del repo (`2026`):

```powershell
docker compose up --build
```

**URLs:**

| Servicio | URL |
|----------|-----|
| Frontend (usar esta) | http://127.0.0.1:5175 |
| API directa | http://127.0.0.1:8001/api/ |
| PostgreSQL (desde el host) | `127.0.0.1:5433` |

La primera vez tarda más: construye imágenes, crea el volumen de PostgreSQL, carga schema/seed y arranca backend + frontend.

### Qué hace Docker (no es magia automática)

| Componente | Qué crea / hace |
|------------|------------------|
| **db** | Contenedor PostgreSQL 15. En el **primer** arranque del volumen ejecuta los SQL de `backend/db/` (schema, seed, migraciones SQL). Los datos quedan en el volumen `postgres_data`. |
| **backend** | Imagen Python con dependencias. Al iniciar: espera a PostgreSQL → migraciones Django → reset de contraseñas seed → `runserver` en el puerto 8000 **dentro** de la red Docker (expuesto como **8001** en tu PC). |
| **frontend** | Imagen Node. Ejecuta Vite en el puerto 5173 **dentro** del contenedor (expuesto como **5175** en tu PC). El proxy `/api` apunta a `http://backend:8000`. |

**Volúmenes montados:** el código de `backend/` y `frontend/` se monta desde tu carpeta. Cambios en `.py` o `.jsx` suelen verse al guardar **sin** reconstruir la imagen.

### ¿Docker se actualiza solo?

**No.** Depende de qué cambió:

| Situación | Comando |
|---------|---------|
| Solo cambiaste código Python/React | `docker compose up` (o dejar corriendo; recarga en caliente) |
| Cambiaste `requirements.txt`, `package.json`, `Dockerfile*` o hiciste `git pull` con esos cambios | `docker compose up --build` |
| Cambiaste scripts SQL de `backend/db/` y querés BD nueva | `docker compose down -v` y luego `docker compose up --build` |
| Querés ver logs en segundo plano | `docker compose up --build -d` → `docker compose logs -f` |
| Parar todo | `docker compose down` |

`docker compose down -v` **borra la base de datos local** del volumen; úsalo solo si querés empezar de cero.

---

## Opción B — Setup manual (Windows, sin Docker)

Todos los comandos asumen que estás en la raíz del repo. En PowerShell **no uses `&&`**; ejecutá un comando por línea o separá con `;`.

### 1. Backend: entorno virtual y dependencias

```powershell
py -3 -m venv backend\.venv
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```

Si `py` no funciona, usá la ruta de tu Python 3.11+ en lugar de `py -3`.

### 2. Base de datos PostgreSQL

**Importante:** hay que estar en `backend\db` antes de ejecutar el script (usa rutas relativas con `\i`).

Ajustá la ruta de `psql.exe` si tu PostgreSQL no es la versión 18 (por ejemplo `...\PostgreSQL\16\bin\psql.exe`).

```powershell
$env:PGPASSWORD = 'diego'
Set-Location backend\db
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' -U postgres -h 127.0.0.1 -d postgres -f 00_run_all.psql
Set-Location ..\..
```

Ese script ya aplica también:
- `09_migracion_pago_transacciones.sql` (trazabilidad de pagos)
- `10_migracion_backfill_clientes_usuario.sql` (vincula usuarios cliente antiguos con tabla `clientes`)

### 3. Migraciones Django (solo la primera vez)

El schema SQL ya crea las tablas de negocio (`catalogos`, etc.). Las tablas **internas de Django** (`django_content_type`, `auth_*`, etc.) **no** vienen en ese SQL; hay que crearlas con migraciones reales.

**No uses** `migrate --fake` a secas: marca todo como aplicado y falla con `no existe la relación django_content_type`.

```powershell
backend\.venv\Scripts\python.exe backend\manage.py migrate contenttypes
backend\.venv\Scripts\python.exe backend\manage.py migrate auth
backend\.venv\Scripts\python.exe backend\manage.py migrate admin
backend\.venv\Scripts\python.exe backend\manage.py migrate sessions
backend\.venv\Scripts\python.exe backend\manage.py migrate catalogos --fake
```

### 4. Contraseñas seed en `123456`

```powershell
backend\.venv\Scripts\python.exe backend\scripts\reset_passwords_and_list_users.py
```

### 5. Frontend: dependencias

Si PowerShell bloquea `npm` (ExecutionPolicy), usá `npm.cmd`:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

(o saltá ese paso y usá siempre `npm.cmd` en lugar de `npm`)

```powershell
Set-Location frontend
npm.cmd install
Set-Location ..
```

### 6. Ejecutar (dos terminales)

**Terminal 1 — backend:**

```powershell
backend\.venv\Scripts\python.exe backend\manage.py runserver 127.0.0.1:8000
```

**Terminal 2 — frontend:**

```powershell
Set-Location frontend
npm.cmd run dev
```

**URLs:**

| Servicio | URL |
|----------|-----|
| Frontend | http://127.0.0.1:5173 |
| API | http://127.0.0.1:8000/api/ |

El proxy de Vite envía `/api` al backend ([frontend/vite.config.js](frontend/vite.config.js)).

**Probar desde el celular (misma Wi‑Fi):** en la terminal de Vite aparece una línea `Network: http://192.168.x.x:5173/`. Abrí esa IP en el navegador del celular (no `localhost`). El backend debe seguir corriendo en la PC.

---

## Solución de problemas

### Stripe (modo prueba) — configuración mínima

La integración quedó preparada para Stripe Checkout en test mode.

#### Variables de entorno backend

Configura estas variables en tu entorno (o en `.env` si usas Docker Compose):

```env
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_CURRENCY=bob
FRONTEND_PUBLIC_URL=http://127.0.0.1:5173
```

> En Docker, `FRONTEND_PUBLIC_URL` normalmente es `http://127.0.0.1:5175`.

#### Endpoints Stripe habilitados

- Checkout público: `POST /api/public/checkout/` con `metodo_pago: "stripe_card"`
- Webhook Stripe: `POST /api/public/payments/webhook/stripe/`

#### Crear webhook en Stripe (test)

Suscribe estos eventos:

- `checkout.session.completed`
- `checkout.session.expired`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `payment_intent.canceled`

#### Prueba local con Stripe CLI

```powershell
stripe login
stripe listen --forward-to http://127.0.0.1:8000/api/public/payments/webhook/stripe/
```

El comando `stripe listen` te devuelve un `whsec_...`; úsalo en `STRIPE_WEBHOOK_SECRET`.

### `no existe la relación django_content_type` al hacer `migrate --fake`

Causa: las migraciones de Django quedaron marcadas como aplicadas pero las tablas `django_*` no existen.

**Solución (solo desarrollo local, base `cosmetica_sistema`):**

```powershell
$env:PGPASSWORD = 'diego'
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' -U postgres -h 127.0.0.1 -d cosmetica_sistema -c "DELETE FROM django_migrations WHERE app IN ('admin','auth','contenttypes','sessions');"
backend\.venv\Scripts\python.exe backend\manage.py migrate contenttypes
backend\.venv\Scripts\python.exe backend\manage.py migrate auth
backend\.venv\Scripts\python.exe backend\manage.py migrate admin
backend\.venv\Scripts\python.exe backend\manage.py migrate sessions
backend\.venv\Scripts\python.exe backend\manage.py migrate catalogos --fake
```

### Aviso: `catalogos have changes that are not yet reflected in a migration`

Es un aviso de Django si los modelos cambiaron respecto a las migraciones. Para el curso, si la app ya funciona, podés ignorarlo. Si necesitás alinear: `makemigrations` + `migrate` (coordinar con el equipo).

### `npm` / ExecutionPolicy en PowerShell

Usá `npm.cmd install` y `npm.cmd run dev`, o ejecutá una vez:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

### Puertos ocupados

| Modo | Frontend | API |
|------|----------|-----|
| Manual | 5173 | 8000 |
| Docker | 5175 | 8001 |

---

## Estructura del repo

- [backend](backend) — `manage.py`, `config`, `catalogos`, `db` (SQL)
- [frontend](frontend) — `package.json`, `App.jsx`, `main.jsx`

## Despliegue a producción

Ver [DEPLOY.md](DEPLOY.md) (Google Cloud Run + Firebase Hosting).
